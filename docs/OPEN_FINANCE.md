# Conectar seu banco ao app (Open Finance): como funciona e passo a passo

## 1. O que é o Open Finance

É o sistema do **Banco Central** que obriga os bancos a compartilharem os seus dados (saldo, extrato,
cartão...) **quando você autoriza**. Você entra no app do seu banco, aprova o compartilhamento, e outra
instituição passa a ler esses dados por uma API padronizada.

## 2. A "burocracia": por que você não pode se conectar direto

Quem recebe dados no Open Finance precisa ser uma **instituição participante autorizada pelo Banco Central**.
Para virar participante é preciso ter empresa, autorização do BC, certificados digitais, passar em testes de
segurança e conformidade e se cadastrar no diretório oficial. É processo de empresa grande: leva meses e custa caro.
**Pessoa física com um app próprio não consegue entrar direto.**

O que existe na prática são os **agregadores** (Pluggy, Belvo e outros). Eles já fazem parte do ecossistema
(ou trabalham com parceiros autorizados) e te entregam uma API simples. Você conecta o seu app a eles, e não ao banco.

### A saída grátis: Meu Pluggy (uso pessoal)

A Pluggy tem um caminho **gratuito para uso pessoal**, o **Meu Pluggy**, feito exatamente para quem quer ler
as próprias contas em um projeto pessoal:

- grátis, sem análise de empresa e sem expirar junto com o período de teste;
- até **5 conexões** (bancos), só da **sua** titularidade e **sem uso comercial**;
- os dados são atualizados **1 vez por dia** (não é em tempo real);
- a autorização vale **1 ano**. Depois é só renovar (passo 3 de novo).

Se um dia você quiser oferecer isso para **outras pessoas** (como produto), aí é o plano comercial da Pluggy,
que tem contrato e custo.

## 3. Passo a passo (uns 15 minutos)

> Você vai precisar do app já publicado (veja o README) ou rodando no seu PC.

### Passo 1: conectar seus bancos no Meu Pluggy
1. Entre em **https://meu.pluggy.ai** e crie uma conta.
2. Clique para conectar cada banco. Você vai ser levado ao app do banco para **autorizar**. Repita para cada banco.

### Passo 2: criar sua "aplicação" no painel de desenvolvedor
1. Entre em **https://dashboard.pluggy.ai** **com a mesma conta** do Meu Pluggy.
   (Se aparecer um "trial de 15 dias", pode ignorar: não afeta o uso pessoal.)
2. Crie uma **aplicação** (*Applications*). Uma só basta.
3. Se a sua aplicação usa seleção personalizada de conectores, ative o conector **MeuPluggy** em
   *Customization → Connectors → Direct Connectors* (grupo *Personal*).

### Passo 3: ligar o Meu Pluggy à sua aplicação
1. Vá em *Applications →* sua aplicação *→ Demo →* **Connect Account**.
2. Escolha **MeuPluggy**. **Não** escolha o seu banco nem o "Sandbox".
3. Entre com a sua conta do Meu Pluggy. Cada banco conectado vira um **item**.

> Se ele pedir o seu CPF e a aprovação do banco de novo, você escolheu o conector do banco em vez do MeuPluggy. Volte e escolha **MeuPluggy**.

### Passo 4: copiar os códigos
- **Item ID** de cada banco: na página *Demo*, em *Connected Items*. Parece com `1a2b3c4d-1234-5678-9abc-def012345678`.
- **Client ID**: na linha da sua aplicação, em *Applications*.
- **Client Secret**: aparece **uma vez só** quando é gerado. Se perdeu, gere outro na página da aplicação.

### Passo 5: colocar as chaves no servidor
**Nunca** coloque essas chaves no GitHub, no código ou em conversa. Elas dão acesso aos seus dados bancários.

- **No Render:** seu serviço → *Environment* → adicione
  `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` → *Save* (ele reinicia sozinho).
- **No seu PC:** coloque as duas linhas no arquivo `.env` (ele não vai para o GitHub) e rode `npm start` de novo.

### Passo 6: no app
1. **Perfil → Conectar banco (Open Finance)**.
2. Cole o **Item ID** → **Adicionar**. O app mostra as contas daquele banco.
3. Escolha quais contas sincronizar e toque em **Sincronizar agora**.
   Na primeira vez ele busca os últimos 90 dias; depois, só o que for novo.

## 4. Como o app trata os dados do banco

- **Conta corrente:** dinheiro que entrou = **Entrada**, dinheiro que saiu = **Saída**.
- **Cartão de crédito:** vem **desligado** por padrão. Se ligar, só as **compras** entram como gasto.
  O pagamento da fatura já aparece como saída na conta corrente, e contar as duas coisas duplicaria o gasto.
- Lançamentos **pendentes** são ignorados até serem confirmados pelo banco.
- **Nunca duplica:** cada lançamento do banco tem um código. Pode sincronizar quantas vezes quiser.
- A **categoria** é adivinhada pela descrição (iFood → Alimentação, Uber → Transporte...). Você pode trocar tocando no lançamento.
- Para apagar tudo que veio do banco: **Perfil → Desfazer importações → Apagar vindos do banco**.

### Quando a autorização vencer (1 ano)
A sincronização para de trazer dados. Repita o **Passo 3**. O banco pode ganhar um **Item ID novo**:
adicione o novo no app e remova o antigo. Os lançamentos não duplicam.

## 5. Sem Open Finance: importar o extrato (funciona hoje, com qualquer banco)

1. No app ou no internet banking do seu banco, abra o **Extrato** e procure **Exportar / Compartilhar / Salvar**.
2. Escolha o formato **OFX** (melhor) ou **CSV**.
3. No app: **Perfil → Importar extrato** → escolha o arquivo → confira a prévia → **Importar**.

Dicas:
- Importar o mesmo arquivo duas vezes **não duplica** nada.
- **Fatura de cartão** em CSV (ex.: Nubank, com colunas `date,title,amount`) é reconhecida sozinha:
  as compras entram como gasto. Se o app não perceber, ligue a opção **"É fatura de cartão de crédito"** na prévia.

## 6. Fontes

- Guia oficial da Pluggy, "Meu Pluggy: uso pessoal": https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use
- API de transações (v2, com paginação por cursor): https://docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor
- Convenções da API e fim do `GET /transactions` antigo: https://docs.pluggy.ai/en/reference/basic-concepts
- Guia da comunidade com o passo a passo do Meu Pluggy: https://github.com/fellipefbarros/open-finance-pessoal
