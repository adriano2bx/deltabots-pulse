import type { Scope } from '@pulse/contracts';

export interface McpToolDef {
  name: string;
  description: string;
  mutating: boolean;
  required_scope: Scope;
  input_schema: Record<string, unknown>;
}

/**
 * Catálogo allowlist de ferramentas MCP (docs/13). Nenhuma executa código arbitrário; ferramentas
 * de alteração exigem confirmação explícita do titular. Não existe `control.execute_unconditional`.
 */
export const MCP_TOOLS: readonly McpToolDef[] = [
  {
    name: 'pulse.devices.list',
    description: 'Lista dispositivos do titular e seu estado reportado.',
    mutating: false,
    required_scope: 'devices:read',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'pulse.telemetry.latest',
    description: 'Últimas leituras por tipo com idade e qualidade.',
    mutating: false,
    required_scope: 'telemetry:read',
    input_schema: {
      type: 'object',
      properties: { device_id: { type: 'string' } },
      required: ['device_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'pulse.telemetry.history',
    description: 'Série histórica consentida de uma métrica.',
    mutating: false,
    required_scope: 'telemetry:read',
    input_schema: {
      type: 'object',
      properties: {
        device_id: { type: 'string' },
        kind: { type: 'string' },
        days: { type: 'integer', maximum: 92 },
      },
      required: ['device_id', 'kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'pulse.sleep.summary',
    description: 'Resumo de sono por noite (estimado pela pulseira).',
    mutating: false,
    required_scope: 'telemetry:read',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', maximum: 90 } },
      additionalProperties: false,
    },
  },
  {
    name: 'pulse.activity.summary',
    description: 'Passos diários e sessões de atividade.',
    mutating: false,
    required_scope: 'telemetry:read',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', maximum: 90 } },
      additionalProperties: false,
    },
  },
  {
    name: 'pulse.insights.get',
    description: 'Insights observacionais não clínicos com fontes.',
    mutating: false,
    required_scope: 'ai:use',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'pulse.reports.generate',
    description: 'Gera relatório diário/semanal/mensal.',
    mutating: true,
    required_scope: 'telemetry:read',
    input_schema: {
      type: 'object',
      properties: { period: { enum: ['daily', 'weekly', 'monthly'] } },
      required: ['period'],
      additionalProperties: false,
    },
  },
  {
    name: 'pulse.automations.draft',
    description: 'Cria rascunho DESATIVADO de automação para revisão do titular.',
    mutating: true,
    required_scope: 'automations:write',
    input_schema: {
      type: 'object',
      properties: { ast: { type: 'object' } },
      required: ['ast'],
      additionalProperties: false,
    },
  },
  {
    name: 'pulse.automations.simulate',
    description: 'Simula uma automação sobre histórico, sem efeitos.',
    mutating: false,
    required_scope: 'automations:read',
    input_schema: {
      type: 'object',
      properties: { automation_id: { type: 'string' }, days: { enum: [7, 30] } },
      required: ['automation_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'pulse.notifications.list',
    description: 'Lista notificações recentes.',
    mutating: false,
    required_scope: 'profile:read',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'pulse.control.request_approval',
    description: 'Solicita aprovação humana para ação em equipamento (não executa).',
    mutating: true,
    required_scope: 'control:arm',
    input_schema: {
      type: 'object',
      properties: { equipment_id: { type: 'string' }, action: { type: 'string' } },
      required: ['equipment_id', 'action'],
      additionalProperties: false,
    },
  },
];
