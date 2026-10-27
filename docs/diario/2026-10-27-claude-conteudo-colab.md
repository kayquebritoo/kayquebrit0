# Conteúdo: post em colab entre empresas

**O que mudou**
- Post do calendário pode ter empresa principal + até 2 empresas em colab (ex.: Hotel + Lounge + Praça).
- Coluna nova `kbos_social_posts.collab_brands` (jsonb, padrão `[]`) — migração 0032 + `migrations.ts` (`conteudo.colab.0`). Só acrescenta.
- Editor do post: abaixo de "Empresa", chips "Colab com" (aparecem quando há empresa principal).
- Calendário/lista mostram as logos e o rótulo "Hotel + Lounge"; o filtro por empresa inclui os colabs.
- Contagem por empresa e plano mensal continuam contando o post uma vez, na empresa principal.

**O que falta**
- Portal do cliente ainda não exibe/edita colab.
