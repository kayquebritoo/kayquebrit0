# Contagem reconciliável no calendário

- Problema: chips fixos Hotel/Lounge/Praça omitiam conteúdos sem empresa/outras marcas. Total do mês aparecia como fração do limite contratual, confundindo cadastro com cumprimento do plano.
- Todas as categorias agora aparecem com contagem, incluindo Sem empresa; soma das categorias corresponde ao total. Botão Todas as empresas mostra o total e limpa o filtro.
- Contador informa exibidos após filtros e total do mês. Plano mensal separado, com ativos e excedente; cancelados não ocupam plano. Não altera limite nem classifica/apaga registros.
- Contagem por ID único, sem multiplicar redes/cópias. Não faz fusão por título (exigiria auditoria dos registros).
- Testes: cenário 24+21+20+16=81, outras marcas, ID repetido/múltiplas redes e cancelados. tsc, ESLint e revisão independente. Leitura de produção pelo navegador bloqueada nesta sessão; não se confirmou a classificação real dos 16 registros restantes.
