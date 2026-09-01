// ==========================================================================
// CONFIGURAÇÃO DO RECORDE GLOBAL — via key-value.co (sem cadastro)
// ==========================================================================
// Este jogo usa o key-value.co, um serviço gratuito de armazenamento JSON
// que não exige criar conta. Para ativar o recorde global:
//
// 1. Gere um token de 5 palavras rodando este comando no terminal:
//
//      curl -X POST https://key-value.co/api/generate
//
//    (ou acesse https://key-value.co e clique em "Generate Token" na
//    seção "Try it live")
//
// 2. Você vai receber algo como:
//      { "success": true, "token": "capable-germinate-disbelief-survival-quantum" }
//
// 3. Cole esse token abaixo, no lugar de "COLE_AQUI_SEU_TOKEN"
//
// 4. Suba este arquivo junto com index.html, script.js e style.css
//
// Se você não preencher isso, o jogo funciona normalmente — só que o
// recorde fica salvo apenas no navegador de cada jogador (localStorage),
// sem um placar global.
//
// IMPORTANTE — sobre este método:
// - É gratuito e não exige cadastro, mas por isso tem menos garantias:
//   sem SLA de disponibilidade, e qualquer pessoa que descubra este token
//   (por exemplo, olhando o código-fonte da página) pode escrever nele.
// - Não coloque nada sensível aqui além do placar do jogo.
// - Se o serviço cair ou o token expirar, o jogo simplesmente volta a
//   funcionar em modo local (isso já está tratado no código).
//
// Observação técnica: este arquivo é carregado como script comum (sem
// "type=module"), de propósito — hospedagens grátis como o InfinityFree
// costumam servir arquivos .js com o MIME type errado, o que quebra
// módulos ES no navegador. Por isso a variável abaixo é global, e não
// um "export".
// ==========================================================================

const leaderboardConfig = {
    token: "COLE_AQUI_SEU_TOKEN"
};

