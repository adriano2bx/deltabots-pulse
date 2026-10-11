import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { handleIngest } from '../src/queues';
import { call, grantHealthConsents, json, registerBand, registerGateway, registerUser } from './helpers';

const now = () => new Date();
const iso = (minAgo: number) => new Date(now().getTime() - minAgo * 60_000).toISOString();

describe('gateway e prova de posse', () => {
  it('rejeita requisição sem assinatura ou com assinatura de outra chave', async () => {
    const u = await registerUser();
    const gw = await registerGateway(u);
    const unsigned = await call('/devices', {
      method: 'POST',
      token: u.access,
      json: { model: 'Mi Band 3', gateway_id: gw.id, hardware_fingerprint: 'x'.repeat(20) },
    });
    expect(unsigned.status).toBe(403);
    const other = await registerGateway(await registerUser());
    // Assina com a chave de outro gateway usando o token deste usuário.
    const forged = await other.signed(
      '/devices',
      'POST',
      { model: 'Mi Band 3', gateway_id: gw.id, hardware_fingerprint: 'y'.repeat(20) },
      u.access,
    );
    expect(forged.status).toBe(403);
  });

  it('registra pulseira, re-pareamento reaproveita o id e heartbeat atualiza status', async () => {
    const u = await registerUser();
    const gw = await registerGateway(u);
    const id1 = await registerBand(u, gw, 'fingerprint-fixo-123456');
    const id2 = await registerBand(u, gw, 'fingerprint-fixo-123456');
    expect(id2).toBe(id1);
    const hb = await gw.signed(`/gateways/${gw.id}/heartbeat`, 'POST', {
      app_version: '1.0.0',
      network: 'wifi',
      devices: [{ device_id: id1, connection_state: 'connected', rssi_dbm: -60 }],
    });
    expect(hb.status).toBe(200);
    const st = await json<{ data: { connection_state: string; stale: boolean } }>(
      await call(`/devices/${id1}/status`, { token: u.access }),
    );
    expect(st.data.connection_state).toBe('connected');
    expect(st.data.stale).toBe(false);
  });
});

describe('ingestão de telemetria (F161–F178, T003)', () => {
  it('exige consentimento para dados de saúde, mas aceita bateria', async () => {
    const u = await registerUser();
    const gw = await registerGateway(u);
    const dev = await registerBand(u, gw);
    const r = await gw.signed('/telemetry/batch', 'POST', {
      gateway_id: gw.id,
      device_id: dev,
      batch_id: 'batch_consent_1',
      readings: [
        {
          reading_id: 'hr_000001',
          kind: 'heart_rate_bpm',
          observed_at: iso(5),
          value: 70,
          unit: 'bpm',
          quality: 'measured',
          source: 'ble_miband3',
        },
        {
          reading_id: 'bt_000001',
          kind: 'battery_percent',
          observed_at: iso(5),
          value: 81,
          unit: '%',
          quality: 'measured',
          source: 'ble_miband3',
        },
      ],
    });
    const ack = await json<{ accepted: string[]; rejected: Array<{ reading_id: string; code: string }> }>(r);
    expect(ack.accepted).toEqual(['bt_000001']);
    expect(ack.rejected).toEqual([{ reading_id: 'hr_000001', code: 'CONSENT_REQUIRED' }]);
  });

  it('mesmo reading_id 3x gera 1 leitura e ACK de duplicadas', async () => {
    const u = await registerUser();
    await grantHealthConsents(u);
    const gw = await registerGateway(u);
    const dev = await registerBand(u, gw);
    const reading = {
      reading_id: 'hr_dup_0001',
      kind: 'heart_rate_bpm',
      observed_at: iso(3),
      value: 72,
      unit: 'bpm',
      quality: 'measured',
      source: 'ble_miband3',
    };
    const send = (bid: string) =>
      gw.signed('/telemetry/batch', 'POST', {
        gateway_id: gw.id,
        device_id: dev,
        batch_id: bid,
        readings: [reading, reading],
      });
    const a1 = await json<{ accepted: string[]; duplicates: string[] }>(await send('batch_dup_1'));
    const a2 = await json<{ accepted: string[]; duplicates: string[] }>(await send('batch_dup_2'));
    expect(a1.accepted).toEqual(['hr_dup_0001']);
    expect(a1.duplicates).toEqual(['hr_dup_0001']);
    expect(a2.accepted).toEqual([]);
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM telemetry_readings WHERE device_id=?')
      .bind(dev)
      .first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('rejeita por item: unidade, faixa e futuro', async () => {
    const u = await registerUser();
    await grantHealthConsents(u);
    const gw = await registerGateway(u);
    const dev = await registerBand(u, gw);
    const ack = await json<{ rejected: Array<{ reading_id: string; code: string }> }>(
      await gw.signed('/telemetry/batch', 'POST', {
        gateway_id: gw.id,
        device_id: dev,
        batch_id: 'batch_bad_1',
        readings: [
          {
            reading_id: 'bad_unit_1',
            kind: 'heart_rate_bpm',
            observed_at: iso(1),
            value: 70,
            unit: 'hz',
            quality: 'measured',
            source: 'x',
          },
          {
            reading_id: 'bad_range1',
            kind: 'heart_rate_bpm',
            observed_at: iso(1),
            value: 900,
            unit: 'bpm',
            quality: 'measured',
            source: 'x',
          },
          {
            reading_id: 'bad_futur1',
            kind: 'heart_rate_bpm',
            observed_at: new Date(Date.now() + 3600_000).toISOString(),
            value: 70,
            unit: 'bpm',
            quality: 'measured',
            source: 'x',
          },
        ],
      }),
    );
    expect(ack.rejected.map((r) => r.code)).toEqual(['UNIT_MISMATCH', 'OUT_OF_RANGE', 'FUTURE_TIMESTAMP']);
  });

  it('latest com proveniência e idade; history paginado; summary sem buckets inventados; agregação idempotente', async () => {
    const u = await registerUser();
    await grantHealthConsents(u);
    const gw = await registerGateway(u);
    const dev = await registerBand(u, gw);
    const readings = [70, 72, 75, 80, 78].map((v, i) => ({
      reading_id: `hr_ser_${i}00`,
      kind: 'heart_rate_bpm',
      observed_at: iso(50 - i * 10),
      value: v,
      unit: 'bpm',
      quality: 'measured',
      source: 'ble_miband3',
    }));
    const ack = await json<{ accepted: string[] }>(
      await gw.signed('/telemetry/batch', 'POST', {
        gateway_id: gw.id,
        device_id: dev,
        batch_id: 'batch_series',
        readings,
      }),
    );
    expect(ack.accepted).toHaveLength(5);

    const latest = await json<{
      data: Array<{ kind: string; value: number; stale: boolean; source: string; age_s: number }>;
    }>(await call(`/telemetry/latest?device_id=${dev}&kinds=heart_rate_bpm`, { token: u.access }));
    expect(latest.data[0]).toMatchObject({
      kind: 'heart_rate_bpm',
      value: 78,
      stale: false,
      source: 'device:Mi Band 3',
    });

    const page1 = await json<{ data: unknown[]; next_cursor: string | null }>(
      await call(
        `/telemetry/history?device_id=${dev}&kind=heart_rate_bpm&from=${iso(120)}&to=${iso(0)}&limit=3`,
        { token: u.access },
      ),
    );
    expect(page1.data).toHaveLength(3);
    const page2 = await json<{ data: unknown[]; next_cursor: string | null }>(
      await call(
        `/telemetry/history?device_id=${dev}&kind=heart_rate_bpm&from=${iso(120)}&to=${iso(0)}&limit=3&cursor=${page1.next_cursor}`,
        { token: u.access },
      ),
    );
    expect(page2.data).toHaveLength(2);
    expect(page2.next_cursor).toBeNull();

    const sum = await json<{ data: Array<{ count: number; avg: number }> }>(
      await call(
        `/telemetry/summary?device_id=${dev}&kind=heart_rate_bpm&from=${iso(24 * 60)}&to=${iso(-1)}&bucket_s=86400`,
        { token: u.access },
      ),
    );
    expect(sum.data.reduce((a, b) => a + b.count, 0)).toBe(5);

    const msg = {
      kind: 'telemetry.batch_ingested' as const,
      event_id: 'evt_test_agg',
      tenant_id: u.tenantId,
      owner_user_id: u.userId,
      device_id: dev,
      reading_ids: ack.accepted,
    };
    await handleIngest(env, msg);
    await handleIngest(env, msg);
    const aggs = await env.DB.prepare(
      'SELECT SUM(count) n FROM telemetry_aggregates WHERE device_id=? AND bucket_size_s=86400',
    )
      .bind(dev)
      .first<{ n: number }>();
    expect(aggs?.n).toBe(5);
  });

  it('outro titular não lê nem envia para o dispositivo (T001)', async () => {
    const a = await registerUser();
    await grantHealthConsents(a);
    const gwA = await registerGateway(a);
    const dev = await registerBand(a, gwA);
    const b = await registerUser();
    const gwB = await registerGateway(b);
    expect((await call(`/telemetry/latest?device_id=${dev}`, { token: b.access })).status).toBe(404);
    expect((await call(`/devices/${dev}`, { token: b.access })).status).toBe(404);
    const push = await gwB.signed('/telemetry/batch', 'POST', {
      gateway_id: gwB.id,
      device_id: dev,
      batch_id: 'batch_xtenant',
      readings: [
        {
          reading_id: 'x_tenant_1',
          kind: 'battery_percent',
          observed_at: iso(1),
          value: 50,
          unit: '%',
          quality: 'measured',
          source: 'x',
        },
      ],
    });
    expect(push.status).toBe(404);
  });
});

describe('comandos ao wearable (F152–F155)', () => {
  it('exige capability verificada, idempotência e entrega só não expirados', async () => {
    const u = await registerUser();
    const gw = await registerGateway(u);
    const dev = await registerBand(u, gw);
    const cmd = { action: 'vibrate', arguments: {}, idempotency_key: 'idem-vibrate-1', ttl_ms: 60000 };
    expect(
      (
        await json<{ code: string }>(
          await call(`/devices/${dev}/commands`, { method: 'POST', token: u.access, json: cmd }),
        )
      ).code,
    ).toBe('CAPABILITY_UNVERIFIED');
    const caps = await gw.signed(`/devices/${dev}`, 'PATCH', {
      capabilities: [
        {
          id: 'vibration_alert',
          support_state: 'SUPPORTED',
          firmware: 'V2.4.0.32',
          driver_version: 'miband3-1.0',
          test_artifact: 'HW06',
        },
      ],
    });
    expect(caps.status).toBe(200);
    const r1 = await json<{ data: { id: string } }>(
      await call(`/devices/${dev}/commands`, { method: 'POST', token: u.access, json: cmd }),
    );
    const r2 = await json<{ data: { id: string } }>(
      await call(`/devices/${dev}/commands`, { method: 'POST', token: u.access, json: cmd }),
    );
    expect(r2.data.id).toBe(r1.data.id);
    const pending = await json<{ data: Array<{ id: string }> }>(
      await gw.signed(`/gateways/${gw.id}/commands`, 'GET'),
    );
    expect(pending.data.map((d) => d.id)).toEqual([r1.data.id]);
    const ack = await gw.signed(`/gateways/${gw.id}/commands/${r1.data.id}/ack`, 'POST', {
      status: 'executed',
    });
    expect(ack.status).toBe(200);
    const again = await gw.signed(`/gateways/${gw.id}/commands/${r1.data.id}/ack`, 'POST', {
      status: 'executed',
    });
    expect(again.status).toBe(409);
  });

  it('familiar não comanda dispositivo', async () => {
    const owner = await registerUser();
    const gw = await registerGateway(owner);
    const dev = await registerBand(owner, gw);
    const stranger = await registerUser();
    const r = await call(`/devices/${dev}/commands`, {
      method: 'POST',
      token: stranger.access,
      json: { action: 'sync_now', arguments: {}, idempotency_key: 'idem-sync-1' },
    });
    expect(r.status).toBe(404);
  });
});
