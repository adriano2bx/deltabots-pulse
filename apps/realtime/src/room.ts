import { DurableObject } from 'cloudflare:workers';
import {
  ControlCommandPayload,
  CommandAckPayload,
  type Envelope,
  type RealtimeEventType,
} from '@pulse/contracts';
import { guardEnvelope, newId, transition, validateCommand, type ControlSnapshot } from '@pulse/core';
import { ALLOWED_TYPES, type Attachment, type ParticipantClaims, type RoomEnv, type RoomMeta } from './types';

const HEARTBEAT_TIMEOUT_MS = 15_000;
const MAX_COMMAND_TTL_MS = 5_000;
const CLOSE_POLICY = 4003;

export interface CommandResult {
  command_id: string;
  status: 'accepted' | 'rejected' | 'failed';
  code: string | null;
  seq: number;
  accepted_at: string;
}

/**
 * Sala de sessão (docs/06): um DO por sessão de controle ou por titular (telemetria ao vivo).
 * Usa WebSocket Hibernation — todo estado de segurança fica em storage/attachments, nunca só em memória.
 */
export class PulseSessionRoom extends DurableObject<RoomEnv> {
  private async meta(): Promise<RoomMeta | undefined> {
    return this.ctx.storage.get<RoomMeta>('meta');
  }

  private async snapshot(): Promise<ControlSnapshot | undefined> {
    return this.ctx.storage.get<ControlSnapshot>('snapshot');
  }

  private async nextSeq(): Promise<number> {
    const seq = ((await this.ctx.storage.get<number>('serverSeq')) ?? 0) + 1;
    await this.ctx.storage.put('serverSeq', seq);
    return seq;
  }

  private async envelope(
    type: RealtimeEventType,
    payload: Record<string, unknown>,
    ttlMs?: number,
  ): Promise<Envelope> {
    const meta = await this.meta();
    const now = Date.now();
    return {
      v: 1,
      id: newId('evt'),
      type,
      tenant_id: meta?.tenantId,
      session_id: meta?.controlSessionId ?? `telemetry:${meta?.ownerUserId ?? ''}`,
      seq: await this.nextSeq(),
      sent_at: new Date(now).toISOString(),
      ...(ttlMs ? { expires_at: new Date(now + ttlMs).toISOString() } : {}),
      payload,
    };
  }

  private sockets(filter?: (a: Attachment) => boolean): Array<{ ws: WebSocket; a: Attachment }> {
    return this.ctx
      .getWebSockets()
      .map((ws) => ({ ws, a: ws.deserializeAttachment() as Attachment }))
      .filter(({ a }) => a && (!filter || filter(a)));
  }

  private async broadcast(
    type: RealtimeEventType,
    payload: Record<string, unknown>,
    filter?: (a: Attachment) => boolean,
    ttlMs?: number,
  ): Promise<number> {
    const env = await this.envelope(type, payload, ttlMs);
    const text = JSON.stringify(env);
    let n = 0;
    for (const { ws } of this.sockets(filter)) {
      try {
        ws.send(text);
        n += 1;
      } catch {
        /* socket encerrado */
      }
    }
    return n;
  }

  private async persistControlState(s: ControlSnapshot): Promise<void> {
    const meta = await this.meta();
    if (!meta?.controlSessionId) return;
    await this.env.DB.prepare(
      `UPDATE control_sessions SET state=?, state_version=?, arm_expires_at=?, last_heartbeat_at=?, armed_at=CASE WHEN ?='ARMED' AND armed_at IS NULL THEN ? WHEN ?<>'ARMED' THEN NULL ELSE armed_at END WHERE id=? AND tenant_id=?`,
    )
      .bind(
        s.state,
        s.stateVersion,
        s.armExpiresAt,
        s.lastHeartbeatAt,
        s.state,
        new Date().toISOString(),
        s.state,
        meta.controlSessionId,
        meta.tenantId,
      )
      .run();
  }

  private async apply(event: Parameters<typeof transition>[1]): Promise<ControlSnapshot | undefined> {
    const s = await this.snapshot();
    if (!s) return undefined;
    const t = transition(s, event);
    if (t.next !== s) await this.ctx.storage.put('snapshot', t.next);
    if (t.changed) {
      await this.persistControlState(t.next);
      await this.broadcast(
        t.next.state === 'ARMED'
          ? 'session.armed'
          : t.next.state === 'DISARMED' || t.next.state === 'EXPIRED' || t.next.state === 'FAULT'
            ? 'session.disarm'
            : 'session.status',
        { state: t.next.state, reason: t.reason, state_version: t.next.stateVersion },
      );
    }
    if (t.next.state === 'ARMED' || t.next.state === 'ARM_REQUESTED')
      await this.ctx.storage.setAlarm(Date.now() + 2_000);
    else await this.ctx.storage.deleteAlarm();
    return t.next;
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/internal/init': {
        const meta = (await request.json()) as RoomMeta;
        await this.ctx.storage.put('meta', meta);
        if (meta.kind === 'control' && meta.equipment && !(await this.snapshot())) {
          const snap: ControlSnapshot = {
            state: 'DISARMED',
            safetyClass: meta.equipment.safetyClass,
            sessionExpiresAt: meta.expiresAt ?? new Date(Date.now() + 300_000).toISOString(),
            armExpiresAt: null,
            lastHeartbeatAt: null,
            heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
            stateVersion: 0,
          };
          await this.ctx.storage.put('snapshot', snap);
        }
        return Response.json({ ok: true });
      }
      case '/internal/connect':
        return this.acceptParticipant(request);
      case '/internal/arm': {
        const body = (await request.json()) as { local_confirmation_id: string; arm_ttl_s: number };
        const s = await this.apply({
          type: 'arm_request',
          localConfirmationId: body.local_confirmation_id,
          now: new Date(),
          armTtlS: body.arm_ttl_s,
        });
        if (s?.state === 'ARM_REQUESTED')
          await this.broadcast(
            'session.arm.request',
            { state_version: s.stateVersion },
            (a) => a.role === 'equipment_gateway' || a.role === 'mqtt_bridge',
            10_000,
          );
        return Response.json({ snapshot: s ?? null });
      }
      case '/internal/disarm': {
        const body = (await request.json()) as { reason: string };
        return Response.json({
          snapshot: (await this.apply({ type: 'disarm', reason: body.reason, now: new Date() })) ?? null,
        });
      }
      case '/internal/command': {
        const body = (await request.json()) as { command: Record<string, unknown>; origin?: string };
        const res = await this.handleCommand(body.command, body.origin ?? 'rest');
        return Response.json(res, { status: res.status === 'accepted' ? 200 : 409 });
      }
      case '/internal/state': {
        const s = await this.snapshot();
        if (s) await this.apply({ type: 'tick', now: new Date() });
        return Response.json({
          snapshot: (await this.snapshot()) ?? null,
          participants: this.sockets().map(({ a }) => a.role),
        });
      }
      case '/internal/revalidate':
        return Response.json({ closed: await this.revalidateViewers() });
      default:
        return new Response('not found', { status: 404 });
    }
  }

  private async acceptParticipant(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket')
      return new Response('upgrade obrigatório', { status: 426 });
    const claims = JSON.parse(request.headers.get('x-pulse-claims') ?? 'null') as ParticipantClaims | null;
    const meta = await this.meta();
    if (!claims || !meta || claims.tenantId !== meta.tenantId)
      return new Response('forbidden', { status: 403 });
    if (
      (claims.role === 'equipment_gateway' || claims.role === 'mqtt_bridge') &&
      claims.equipmentId !== meta.equipment?.id
    )
      return new Response('forbidden', { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [claims.role]);
    const att: Attachment = { ...claims, lastSeq: 0, connectedAt: new Date().toISOString() };
    server.serializeAttachment(att);
    const s = await this.snapshot();
    server.send(
      JSON.stringify(
        await this.envelope('session.ready', {
          role: claims.role,
          state: s?.state ?? null,
          state_version: s?.stateVersion ?? null,
          allowed_types: ALLOWED_TYPES[claims.role],
        }),
      ),
    );
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const a = ws.deserializeAttachment() as Attachment;
    if (typeof message !== 'string') {
      ws.send(JSON.stringify(await this.envelope('server.error', { code: 'BINARY_NOT_ENABLED' })));
      return;
    }
    const state = { lastSeq: a.lastSeq };
    const g = guardEnvelope(
      message,
      {
        tenantId: a.tenantId,
        sessionId: a.sessionId,
        gatewayId: a.gatewayId,
        allowedTypes: new Set(ALLOWED_TYPES[a.role]),
      },
      state,
      new Date(),
    );
    if ('reject' in g) {
      ws.send(
        JSON.stringify(
          await this.envelope(g.reject === 'REPLAY' ? 'server.error' : 'server.error', {
            code: g.reject,
            detail: g.detail ?? null,
          }),
        ),
      );
      return;
    }
    ws.serializeAttachment({ ...a, lastSeq: state.lastSeq });
    const e = g.ok;
    const now = new Date();
    switch (e.type) {
      case 'session.hello': {
        const s = await this.snapshot();
        ws.send(
          JSON.stringify(
            await this.envelope('session.status', {
              state: s?.state ?? null,
              state_version: s?.stateVersion ?? null,
            }),
          ),
        );
        return;
      }
      case 'session.heartbeat':
        if (a.role === 'android_gateway') await this.apply({ type: 'heartbeat', now });
        if (a.role === 'equipment_gateway' || a.role === 'mqtt_bridge')
          await this.ctx.storage.put('equipmentSeenAt', now.toISOString());
        return;
      case 'session.arm.request': {
        const s = await this.apply({
          type: 'arm_request',
          localConfirmationId: String(e.payload.local_confirmation_id),
          now,
          armTtlS: 120,
        });
        if (s?.state === 'ARM_REQUESTED')
          await this.broadcast(
            'session.arm.request',
            { state_version: s.stateVersion },
            (x) => x.role === 'equipment_gateway' || x.role === 'mqtt_bridge',
            10_000,
          );
        return;
      }
      case 'session.armed':
        await this.apply({ type: 'arm_confirmed', now });
        return;
      case 'session.disarm':
        await this.apply({ type: 'disarm', reason: `solicitado por ${a.role}`, now });
        return;
      case 'control.command': {
        const res = await this.handleCommand(e.payload, a.role);
        ws.send(
          JSON.stringify(
            await this.envelope(res.status === 'accepted' ? 'control.accepted' : 'control.failed', {
              ...res,
            }),
          ),
        );
        return;
      }
      case 'gesture.detected':
        await this.handleGesture(
          e.payload as { gesture: string; confidence: number; model_version: string },
          ws,
          a,
        );
        return;
      case 'command.ack':
        await this.handleAck(e.payload);
        return;
      case 'telemetry.update':
      case 'device.status': {
        const meta = await this.meta();
        if (meta?.kind !== 'telemetry' || a.role !== 'android_gateway') return;
        const metric =
          e.type === 'device.status'
            ? 'connection'
            : String((e.payload as { kind?: string }).kind ?? '').startsWith('heart')
              ? 'heart_rate'
              : String((e.payload as { kind?: string }).kind ?? '').startsWith('steps')
                ? 'steps'
                : 'battery';
        await this.broadcast(
          e.type,
          e.payload,
          (x) => x.role === 'console' || (x.role === 'family_viewer' && (x.metrics ?? []).includes(metric)),
        );
        return;
      }
      default:
        return;
    }
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    const a = ws.deserializeAttachment() as Attachment | null;
    // Perda do gateway Android ou do equipamento desarma imediatamente (fail-closed, T002/HW15).
    if (a && (a.role === 'android_gateway' || a.role === 'equipment_gateway' || a.role === 'mqtt_bridge')) {
      await this.apply({ type: 'disarm', reason: `${a.role} desconectado (${code})`, now: new Date() });
    }
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'encerrado');
    } catch {
      /* já fechado */
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws, 1011);
  }

  override async alarm(): Promise<void> {
    await this.apply({ type: 'tick', now: new Date() });
  }

  private async handleCommand(raw: Record<string, unknown>, origin: string): Promise<CommandResult> {
    const nowIso = new Date().toISOString();
    const parsed = ControlCommandPayload.safeParse(raw);
    if (!parsed.success)
      return {
        command_id: String(raw.command_id ?? 'unknown'),
        status: 'rejected',
        code: 'VALIDATION_ERROR',
        seq: 0,
        accepted_at: nowIso,
      };
    const cmd = parsed.data;
    const cached = await this.ctx.storage.get<CommandResult>(`cmd:${cmd.idempotency_key}`);
    if (cached) return cached; // RF-06: mesmo comando nunca gera efeito duplicado
    const meta = await this.meta();
    await this.apply({ type: 'tick', now: new Date() });
    const s = await this.snapshot();
    if (!meta?.equipment || !s || cmd.equipment_id !== meta.equipment.id)
      return {
        command_id: cmd.command_id,
        status: 'rejected',
        code: 'VALIDATION_ERROR',
        seq: 0,
        accepted_at: nowIso,
      };
    const rejection = validateCommand({
      snapshot: s,
      now: new Date(),
      expiresAt: cmd.expires_at,
      action: cmd.action,
      allowedActions: meta.equipment.allowedActions,
      maxTtlMs: MAX_COMMAND_TTL_MS,
      lastCommandAt: (await this.ctx.storage.get<string>('lastCommandAt')) ?? null,
      maxRateHz: meta.equipment.maxRateHz,
      expectedStateVersion: cmd.expected_state_version,
    });
    const seq = await this.nextSeq();
    let result: CommandResult;
    if (rejection) {
      result = { command_id: cmd.command_id, status: 'rejected', code: rejection, seq, accepted_at: nowIso };
    } else {
      const equipment = this.sockets((x) => x.role === 'equipment_gateway' || x.role === 'mqtt_bridge');
      if (!equipment.length) {
        result = {
          command_id: cmd.command_id,
          status: 'failed',
          code: 'DEVICE_UNAVAILABLE',
          seq,
          accepted_at: nowIso,
        };
      } else {
        await this.ctx.storage.put('lastCommandAt', nowIso);
        const env = await this.envelope(
          'control.command',
          { ...cmd, origin },
          Math.max(0, new Date(cmd.expires_at).getTime() - Date.now()),
        );
        for (const { ws } of equipment) ws.send(JSON.stringify(env));
        result = { command_id: cmd.command_id, status: 'accepted', code: null, seq, accepted_at: nowIso };
      }
    }
    await this.ctx.storage.put(`cmd:${cmd.idempotency_key}`, result);
    if (meta.controlSessionId) {
      await this.env.DB.prepare(
        `INSERT OR IGNORE INTO control_commands(id,tenant_id,session_id,equipment_id,seq,action,payload_json,issued_at,expires_at,status,idempotency_key,result_code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          cmd.command_id,
          meta.tenantId,
          meta.controlSessionId,
          cmd.equipment_id,
          seq,
          cmd.action,
          JSON.stringify({ arguments: cmd.arguments, origin }),
          nowIso,
          cmd.expires_at,
          result.status,
          cmd.idempotency_key,
          result.code,
        )
        .run();
    }
    return result;
  }

  private async handleAck(raw: Record<string, unknown>): Promise<void> {
    const p = CommandAckPayload.safeParse(raw);
    if (!p.success) return;
    const meta = await this.meta();
    const status =
      p.data.ack === 'ACK_EXECUTED' ? 'executed' : p.data.ack === 'ACK_ACCEPTED' ? 'acked' : 'failed';
    const now = new Date().toISOString();
    if (meta?.controlSessionId) {
      await this.env.DB.prepare(
        `UPDATE control_commands SET status=?, acked_at=COALESCE(acked_at,?), executed_at=CASE WHEN ?='executed' THEN ? ELSE executed_at END, result_code=COALESCE(?,result_code) WHERE id=? AND session_id=?`,
      )
        .bind(status, now, status, now, p.data.code ?? null, p.data.command_id, meta.controlSessionId)
        .run();
    }
    if (p.data.ack !== 'ACK_ACCEPTED') {
      await this.broadcast(
        p.data.ack === 'ACK_EXECUTED' ? 'control.executed' : 'control.failed',
        {
          command_id: p.data.command_id,
          code: p.data.code ?? null,
          state_version: p.data.state_version ?? null,
        },
        (x) => x.role === 'android_gateway' || x.role === 'console',
      );
    }
  }

  /** Gesto → mapeamento allowlist do titular → comando, somente com sessão armada (F334–F335). */
  private async handleGesture(
    payload: { gesture: string; confidence: number; model_version: string },
    ws: WebSocket,
    a: Attachment,
  ): Promise<void> {
    const meta = await this.meta();
    if (!meta?.equipment || meta.kind !== 'control') return;
    const mapping = await this.env.DB.prepare(
      `SELECT action,args_json,min_confidence,requires_approval FROM gesture_mappings WHERE tenant_id=? AND owner_user_id=? AND gesture_key=? AND equipment_id=? AND enabled=1`,
    )
      .bind(meta.tenantId, meta.ownerUserId, payload.gesture, meta.equipment.id)
      .first<{ action: string; args_json: string; min_confidence: number; requires_approval: number }>();
    const reply = async (type: RealtimeEventType, p: Record<string, unknown>) =>
      ws.send(JSON.stringify(await this.envelope(type, p)));
    if (!mapping) return reply('gesture.rejected', { reason: 'NO_MAPPING', gesture: payload.gesture });
    if (payload.confidence < mapping.min_confidence)
      return reply('gesture.rejected', { reason: 'LOW_CONFIDENCE', confidence: payload.confidence });
    if (mapping.requires_approval === 1)
      return reply('control.failed', { code: 'APPROVAL_REQUIRED', gesture: payload.gesture });
    const res = await this.handleCommand(
      {
        command_id: newId('cmd'),
        action: mapping.action,
        arguments: JSON.parse(mapping.args_json),
        idempotency_key: `gesture-${a.sessionId}-${newId('evt')}`,
        expires_at: new Date(Date.now() + 1500).toISOString(),
        equipment_id: meta.equipment.id,
      },
      'gesture',
    );
    return reply(res.status === 'accepted' ? 'control.accepted' : 'control.failed', {
      ...res,
      gesture: payload.gesture,
    });
  }

  /** Revogação com conexão ativa (T010): fecha espectadores sem concessão válida. */
  private async revalidateViewers(): Promise<number> {
    const meta = await this.meta();
    if (!meta) return 0;
    let closed = 0;
    for (const { ws, a } of this.sockets((x) => x.role === 'family_viewer')) {
      const g = await this.env.DB.prepare(
        `SELECT 1 FROM share_grants WHERE tenant_id=? AND owner_user_id=? AND grantee_user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)`,
      )
        .bind(meta.tenantId, meta.ownerUserId, a.userId, new Date().toISOString())
        .first();
      if (!g) {
        ws.close(CLOSE_POLICY, 'concessão revogada');
        closed += 1;
      }
    }
    return closed;
  }
}
