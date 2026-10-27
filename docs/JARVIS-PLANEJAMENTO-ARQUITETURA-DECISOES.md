# Jarvis — Planejamento, Arquitetura e Decisões

Atualizado em: 27/10/2026
Status: decisões de produto; implementação e validação pendentes.

## Visão
Assistente pessoal acionado por linguagem natural e voz, com execução de rotinas autorizadas no KBOS e Lume. Princípio: o usuário administra o negócio, não terminais, comandos ou ferramentas.

## Decisões confirmadas
1. **Voz primeiro:** comandos em português natural, tolerância a variações de pronúncia e reconhecimento de nomes de clientes e redes sociais pelo contexto. Evitar formulários, terminal e passos manuais sempre que existir automação segura.
2. **Integrações:** consultar e operar KBOS e Lume por interfaces autenticadas, com permissões mínimas e ações auditáveis. Não presumir que uma integração já funciona sem teste.
3. **Estado de execução:** informar tarefas em andamento, concluídas, falhas e pendências; não afirmar que há trabalho em segundo plano sem uma execução real.
4. **Segurança:** pedir aprovação para ações destrutivas, irreversíveis ou de impacto em produção. Backup e validação antes de migrações; nunca expor credenciais.
5. **Apple Watch:** o usuário possui Apple Watch Series 9 GPS. Integração por Siri/Atalhos fica **depois** da validação e estabilidade do Jarvis principal. A versão GPS depende do iPhone ou Wi-Fi para conectividade.
6. **Calendário de conteúdo:** unidade de entrega é o conteúdo produzido, não uma postagem por rede; preservar status individual por rede social.

## Contexto operacional em 27/10/2026
- Usuário relatou migração do Neon para PostgreSQL na VPS e backup no Google Drive. **Relato do usuário; não auditado nesta nota.**
- Alguns registros de conteúdos anteriores a 15/10 podem ter perdido status/histórico, embora as publicações tenham sido feitas. Correção planejada pela interface do KBOS.
- Neon possivelmente acessível novamente em 31/10; **não sincronizar sobrescrevendo o banco atual**. Antes, comparar registros e resolver conflitos; preservar alterações posteriores e backup.

## Critérios para considerar o Jarvis validado
- Comandos de voz variados identificam corretamente intenção, entidade, cliente e data.
- Consultas e ações autorizadas no KBOS/Lume funcionam de ponta a ponta, com confirmação de resultado.
- Erros são reportados sem inventar sucesso; logs e trilha de auditoria disponíveis.
- Fluxos de alto risco exigem aprovação e suportam recuperação.
- Só então priorizar experiência no Apple Watch.

## Próximos passos
1. Auditar implementação atual do agente e listar capacidades reais, lacunas e testes.
2. Definir contrato único de comandos de voz e roteamento de intenções para KBOS/Lume.
3. Validar leitura, escrita autorizada, feedback de execução e segurança.
4. Integrar Siri/Atalhos ao Apple Watch após aprovação dos testes.

## Manutenção
Registrar decisões novas com data, motivação, impacto e status. Não tratar propostas como funcionalidades implementadas.
