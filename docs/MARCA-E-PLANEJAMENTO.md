# Marca e planejamento após o aceite

## Fluxo
1. O cliente abre o link da proposta. Antes de assinar, confere os dados da empresa, troca/envia logos e materiais, informa cores e descreve essência e objetivos.
2. O aceite congela esse perfil junto à venda e cria o projeto e um planejamento em preparação, na mesma operação atômica. Repetir a requisição não cria outro planejamento nem altera o perfil assinado.
3. O cliente recebe o botão **Abrir minha marca e planejamento**. Até a publicação, vê apenas a identidade confirmada e o aviso de preparação.
4. No painel **Marcas e planejamentos**, Kayque completa e salva o rascunho. A página reúne conceito, posicionamento, público, tom de voz, tipografia, cores, regras de uso, 5 Ps, SWOT, metas, calendário editorial, execução e biblioteca de arquivos.
5. **Publicar para o cliente** cria uma versão para revisão. O cliente pode aprovar ou pedir ajustes por seção, com nome e data. Uma nova publicação exige nova aprovação; as revisões anteriores ficam no histórico.

A estrutura é criada automaticamente com os dados recebidos. A estratégia precisa ser escrita/revisada no editor antes da publicação; não há geração automática de decisões estratégicas por IA nesta etapa.

## Uso e apresentação
- `/admin/planejamentos/`: lista e editor dos planejamentos criados por novos aceites.
- `/admin/planejamentos/preview/`: demonstração fictícia, sem gravar dados ou contratos.
- `/planejamento/[token]/`: página do cliente, sem navegação administrativa, com navegação horizontal e cartões pensados para celular.
- O editor oferece prévia e link compartilhável. Gerar outro link revoga o anterior; o acesso pelo orçamento assinado continua válido.
- Marca, arquivos e conteúdo do rascunho não substituem silenciosamente a versão publicada.
- Logo em PNG/JPEG/WebP/GIF tem prévia. SVG, AI e EPS ficam disponíveis como download, sem executar conteúdo vetorial no domínio do painel.
- Arquivos: até 10 MiB por arquivo, limite acumulado de 50 MiB por orçamento, incluindo os materiais anteriores. O cliente pode enviar até 30 materiais da marca.
- Links contêm acesso à proposta/empresa: compartilhar somente com o cliente e sua equipe autorizada. Páginas não são indexáveis e não enviam referrer.

## Persistência e validação
Migração `0014_planejamento_marca.sql`, aplicada pelo boot. `company_profile` da venda e `signed_profile` do planejamento registram os dados confirmados; `draft` e `published` separam edição de revisão. Edição usa revisão otimista e aprovação exige a versão publicada atual.

Arquivos pertencem ao orçamento; o servidor valida origem e associação, sem confiar nos nomes/metadados enviados pelo navegador. Arquivos do rascunho não ficam acessíveis no link público antes da publicação. Downloads usam `nosniff`, CSP restritiva e cache privado desativado.

Testes PGlite exercitam migração, aceite atômico, repetição, perfil imutável, atualização do contato, publicação, conflitos de edição, aprovação por versão, pedido de ajuste, isolamento dos arquivos e rotação de link. Não assinar contratos reais para testar: usar testes descartáveis e a demonstração.
