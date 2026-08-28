// ==========================================================================
// CONFIGURAÇÃO DO FIREBASE — recorde global compartilhado entre jogadores
// ==========================================================================
// 1. Crie um projeto gratuito em https://console.firebase.google.com
// 2. Ative o Firestore Database (modo produção)
// 3. Registre um app da Web no projeto para gerar as chaves abaixo
// 4. Cole os valores gerados aqui embaixo, substituindo os textos de exemplo
// 5. Suba este arquivo junto com index.html, script.js e style.css
//
// Se você não preencher isso, o jogo continua funcionando normalmente,
// mas o recorde volta a ficar salvo apenas no navegador de cada pessoa.
// ==========================================================================

export const firebaseConfig = {
    apiKey: "COLE_AQUI_SUA_API_KEY",
    authDomain: "SEU_PROJETO.firebaseapp.com",
    projectId: "SEU_PROJETO",
    storageBucket: "SEU_PROJETO.appspot.com",
    messagingSenderId: "SEU_SENDER_ID",
    appId: "SEU_APP_ID"
};
