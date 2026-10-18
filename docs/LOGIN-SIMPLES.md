# Login simples — operação

O site público na Vercel encaminha `/entrar/` para o domínio KBOS na VPS: o acesso usa uma sessão principal e o envio de WhatsApp fica no ambiente que alcança a Evolution interna.

O formulário principal usa usuário/e-mail e senha. `kayque` é alias reservado do administrador principal. Outros titulares podem escolher um usuário ao recuperar/definir a senha após validar um código. O e-mail continua válido.

Administrador já autenticado pode conferir a apresentação sem sair da conta em `/entrar/?preview=1`. A rota normal continua encaminhando usuários autenticados ao painel.

## Código de acesso

- WhatsApp ou e-mail, somente para conta existente e destino já cadastrado. Visitante não escolhe livremente o número de entrega.
- WhatsApp usa `users.phone`; para o administrador principal pode usar `ASSISTANT_OWNER_PHONE` já configurado na VPS.
- Código de 6 dígitos, 5 minutos, hash scrypt, até 5 tentativas e uso único. Criação da sessão e consumo são atômicos.
- Intervalo de 60 segundos por conta, além dos limites por IP. Falha de envio invalida o código, sem registrar números ou códigos em logs.
- A resposta da solicitação não revela se a conta ou o canal existe. Não cria conta, não promove o titular a administrador.
- “Esqueci minha senha / primeiro acesso” valida o código antes de permitir definir uma senha. Nenhuma senha de produção foi trocada durante a implementação.
- O magic link legado permanece compatível com links já emitidos, mas não é oferecido pelo novo formulário.

## Google

Implementado com `openid-client`: OIDC, PKCE S256, state, nonce, validação de assinatura/claims e cookie httpOnly de 10 minutos. Só aparece na interface com `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` configurados.

Criar cliente OAuth web no Google Cloud, configurar a tela de consentimento e registrar o callback exato do domínio de login:
`https://kbos.kayquebrito.com.br/api/auth/google/callback/`

Se o login operar no domínio raiz, `APP_URL` e o callback autorizado precisam corresponder ao mesmo domínio. Não copiar segredo para o chat nem para o Git: salvar no ambiente da VPS. O Compose encaminha as duas variáveis. A publicação subsequente recria o serviço com a configuração.

Usa uma conta KBOS já cadastrada. Associação automática por endereço somente quando Google é autoridade do e-mail (Gmail ou Workspace do domínio correspondente); outros e-mails usam senha/código até uma vinculação assistida. Permissões vêm do usuário existente, nunca de parâmetros do navegador.

**Pendente de ativação externa:** credenciais OAuth e teste real com a conta Google. Não há botão decorativo prometendo login sem o provedor configurado.

## Validação

PGlite descartável: usuário/e-mail, senha incorreta, hash do código, expiração, limite de tentativas, reenvio por conta/canal, entrega falha, destino não cadastrado, concorrência e uso único. Envio real não deve ser testado para terceiros; o titular solicita e digita o próprio código.
