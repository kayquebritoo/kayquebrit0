# Relatório da manhã — 20/10/2026

Tudo abaixo está na `main` com CI verde; a VPS publica sozinha em até ~5 min (cron `deploy.sh --auto`).

## Pronto (para testar)
1. **Portal do cliente** (`/portal`): cabeçalho de perfil com capa, projetos com etapas, arquivos para aprovar, "O que está em andamento" (tarefas), "Pagamentos" (só entradas dos projetos dele) e botão **Conversar com a equipe** com contador de novas.
   Teste: entre como cliente (ex.: Thalita) → abra um projeto → mande uma mensagem. No admin, abra o projeto (Projetos → clicar no cartão) → **Conversa do projeto** → responda; volte ao portal e veja o contador.
2. **Importador de extrato** (Financeiro → **Importar extrato**): CSV/OFX do PicPay ou outro banco, prévia com "já importado", escolha Pessoal/Empresa, não duplica se importar de novo.
   Teste: exporte o extrato do app do PicPay e envie. **Se os nomes das colunas do CSV real forem diferentes, me mande o arquivo (pode apagar dados sensíveis) que eu ajusto.**
3. **Lucro por cliente** (Relatórios): ranking por período (mês, mês passado, 12 meses, ano) — já estava pronto antes.
4. Fotos do WhatsApp nos contatos e "Combinar iguais" — já estavam no ar.

## Depende de você (fila)
- **Trocar a chave da OpenAI** que apareceu no terminal da VPS (recomendado).
- **Notificação push** (iPhone/PWA): precisa gerar as chaves VAPID e colar no `.env` da VPS com `read -s` (eu não vejo a chave). No iPhone só funciona com o site instalado na Tela de Início (iOS 16.4+). Não comecei para não deixar código sem teste real.
- **Assistente do KBOS usando o Lume**: depende do `LUME_API_TOKEN` (rotacionar) e da pasta `LUME_DRIVE_PASTA` apontando para a pasta própria no Drive.
- **App do celular com o "cérebro" do WhatsApp** (`lib/kbos/agent.ts`, área sensível): aguardando sua aprovação.
- **Contatos**: o Caio ainda aparece só com número (rodar a importação do Google e ver se o nome vem); 1896 leads do WhatsApp sem nome — me diga se quer um filtro "sem nome" e arquivar em lote (não apaguei nada).
- **Login com contato@kayquebrito.com.br**: precisa ser uma Conta Google de verdade para entrar como testador.
- Limpar as linhas duplicadas do crontab da VPS; `RESEND_API_KEY`; testar o acesso da Thalita; rota de saúde para o UptimeRobot; apagar `recovery-codes-vercel.txt` do SSD/Drive e regenerar os códigos.

## Limites que respeitei
Sem tocar em cobrança, sem apagar dados, sem mexer em `agent.ts`, nenhum segredo lido ou escrito. Nesta sessão o npm ficou sem rede, então os testes novos rodaram só no CI do GitHub (passaram).
