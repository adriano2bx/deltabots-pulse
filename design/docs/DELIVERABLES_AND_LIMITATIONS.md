# Escopo do kit e próximos insumos obrigatórios

### Arquivos que já podem ser usados
- Android: 76 SVGs e PNGs por rota A01–A76 do PRD. Esboços estéticos, não implementações completas.
- Web: 58 SVGs e PNGs por rota do Console, com visão de layout e navegação.
- Mi Band 3: 24 layouts 1-bit portrait 80×128, PNG + SVG pixelado, prévias x6.
- 27 ícones funcionais com versões SVG e PNG rasterizadas. São recursos de UI, NÃO são a logo DeltaBots.
- Tokens em JSON/CSS/TypeScript/Compose e recursos Android.
- Guia de identidade, galeria HTML offline, arquivos de mapeamento e script para aplicação determinística do master.

### O que impede que seja um pacote final de produção
1. **MASTER v4.1:** localizar/inserir os SVGs oficiais aprovados. A pasta `brand/approved/` explica os arquivos exigidos. O script automatiza distribuição, mas a validação óptica continua humana.
2. **Telas:** são layouts vetoriais de referência. Funcionalidades, transições, estados, acessibilidade e ligação com API devem ser implementadas pelo Claude Code conforme PRD.
3. **.res:** não há binário de recursos Xiaomi original/permitido nem mapeamento por slot e versão de firmware; não gerar pacote flashável arbitrário. Os 24 concept screens NÃO significam 24 menus novos no firmware.
4. **Fontes:** não incluídas; instalar versões licenciadas.

### Como integrar
Use esse pacote ao lado de `DELTABOTS_PULSE_PACOTE_COMPLETO_CLAUDE_CODE_v1.1.zip`. Siga `CLAUDE_VISUAL_HANDOFF.md` e `CLAUDE.md` do PRD.
