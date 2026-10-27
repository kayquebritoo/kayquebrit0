# Conteúdo: colab refeito (um campo só) + portal

**O que mudou**
- O "Empresa" (lista) + "Colab com" (chips) virou um campo só, `BrandPicker`: Hotel, Lounge e Praça com logo; toque em 1 (post da empresa) ou em 2–3 (colab). A primeira marcada é a principal (★) e é onde o post conta no plano; a linha embaixo diz "Colab: Hotel + Lounge · conta no plano de Hotel".
- Portal do cliente: mostra "Hotel + Lounge" nos posts, o filtro por empresa inclui os colabs e o editor usa o mesmo campo. API do portal aceita `collabBrands` (criar e editar).
- `cleanCollab` (lib/kbos/social-posts.ts) centraliza a regra: até 2 além da principal, sem repetir.

**O que falta**
- Nada pendente do colab.
