# Sistema de Pagamentos (AC) — versão 2

App pessoal para controlar **recebimentos e gastos**, com previsão semanal, dicas automáticas e avisos.
Funciona no celular como app instalado (PWA): ícone na tela inicial, tela cheia e funciona até sem internet.
Os dados ficam no **seu próprio servidor**.

> Este repositório é a "fonte" do app. Enquanto ele estiver no GitHub, você não perde mais o projeto,
> mesmo se apagar algo do celular ou do computador.

## O que tem

| Tela | O que faz |
|---|---|
| **Início** | Saldo do mês, recebido × gasto, saldo total acumulado, previsão do mês, **semanas do mês** (completa / em andamento / faltou), dicas do assistente e últimos lançamentos |
| **+** | Lança uma entrada ou saída em segundos (valor estilo maquininha, categoria, data, observação) |
| **Extrato** | Todos os lançamentos do mês agrupados por dia, filtro entrada/saída e busca. Toque para editar ou apagar (com "Desfazer") |
| **Análise** | Gráfico dos últimos 6 meses e gastos/recebimentos por categoria |
| **Perfil** | Previsão semanal, limite de gastos, saldo inicial, **conectar banco (Open Finance)**, **importar extrato OFX/CSV**, baixar planilha, backup/restauração, instalar no celular, trocar senha |
| 🔔 Avisos | Semana terminando sem bater a previsão, semana completa, limite de gastos em 80%/100%, mês no vermelho, dias sem registrar |

### O que mudou em relação ao app antigo

- **Perfil não fecha mais o app.** Toda tela tem proteção: se algo der errado, aparece um aviso com "Tentar de novo" em vez de fechar.
- Valores não ficam mais cortados (o "R$ 215,00" que aparecia pela metade).
- As porcentagens fazem sentido: "você gastou 35% do que recebeu", e a previsão é calculada de verdade pela sua meta semanal.
- Cores com significado: verde = entrou, vermelho = saiu (antes o "Recebido" era vermelho).
- As dicas do assistente são calculadas com os seus dados (comparação com a média dos últimos meses, quanto dá para gastar por dia, maior categoria...).
- Login com senha, servidor próprio, backup e exportação para Excel.
- Importação de extrato de **qualquer banco** e conexão automática via **Open Finance**.

## Rodar no seu computador (2 minutos)

Precisa do [Node.js 22 ou mais novo](https://nodejs.org/) instalado.

```bash
npm install
npm start
```

Abra http://localhost:3000, crie sua conta e pronto. Os dados ficam no arquivo `data/app.db`.

> Por segurança, **só a primeira conta pode ser criada**. Depois disso o cadastro fecha sozinho.
> Para liberar mais contas (ex.: alguém da família), coloque `ALLOW_SIGNUP=true` no `.env`.

## Colocar na internet (para usar no celular de qualquer lugar)

O jeito grátis recomendado é **Render** (servidor) + **Neon** (banco de dados Postgres).

> ⚠️ **Não pule o Neon.** No plano grátis do Render o disco é apagado a cada reinício.
> Sem o `DATABASE_URL` você perderia os lançamentos.

1. **Banco de dados (Neon):** crie uma conta em [neon.tech](https://neon.tech) → *New project* → copie a
   *connection string* (começa com `postgresql://...`). O plano grátis tem 1 GB, que dá para anos de lançamentos.
2. **Servidor (Render):** crie uma conta em [render.com](https://render.com) com o seu GitHub →
   *New* → *Blueprint* → escolha este repositório. O arquivo `render.yaml` já configura tudo.
3. Quando ele pedir as variáveis, cole a URL do Neon em **`DATABASE_URL`**. Deixe as da Pluggy em branco por enquanto.
4. Espere o deploy terminar e abra o endereço `https://sistema-de-pagamentos-xxxx.onrender.com`.

No plano grátis o Render "dorme" depois de 15 minutos sem uso. O primeiro acesso depois disso demora
mais ou menos 1 minuto para acordar. Se isso incomodar, o plano pago mais barato (~US$ 7/mês) deixa o servidor sempre ligado.

**Outras opções:** o `Dockerfile` serve para Railway, Fly.io, um VPS ou um PC/notebook velho em casa.
Nesse caso monte um volume em `/data` (é onde fica o banco SQLite).

## Instalar no celular

- **Android (Chrome):** abra o endereço do app → menu **⋮** → **Instalar app**. Ou vá em *Perfil → Instalar no celular*.
- **iPhone (Safari):** botão **Compartilhar** → **Adicionar à Tela de Início**.

O ícone AC aparece na tela inicial e o app abre em tela cheia. Para mandar para outra pessoa, é só mandar o link.

## Seus dados (nunca mais perder nada)

- **Perfil → Fazer backup**: baixa um arquivo `.json` com tudo. Guarde no Google Drive, por exemplo.
- **Perfil → Restaurar backup**: recupera tudo a partir desse arquivo, sem duplicar.
- **Perfil → Baixar planilha**: CSV que abre no Excel ou no Google Sheets.

## Conectar o banco

Veja o guia completo em **[docs/OPEN_FINANCE.md](docs/OPEN_FINANCE.md)**. Resumo:

- **Já funciona, sem burocracia:** *Perfil → Importar extrato*. Exporte o extrato do app do banco em **OFX** ou **CSV** e escolha o arquivo.
  Funciona com Nubank, Inter, Itaú, Bradesco, Santander, C6, Caixa, BB e outros. Importar de novo não duplica nada.
- **Automático (Open Finance):** pelo **Meu Pluggy**, que é grátis para uso pessoal. Você coloca 2 chaves no servidor
  e o app puxa os lançamentos do banco com um toque.

## Configurações (`.env`)

Copie `.env.example` para `.env`. Nada é obrigatório para rodar no PC.

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | URL do Postgres (Neon etc.). Vazio = SQLite em `data/app.db` |
| `SQLITE_PATH` | Onde salvar o arquivo SQLite (padrão `data/app.db`) |
| `ALLOW_SIGNUP` | `true` libera novos cadastros depois do primeiro |
| `APP_TIMEZONE` | Fuso para saber "que dia é hoje" (padrão `America/Sao_Paulo`) |
| `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` | Chaves do Open Finance (Pluggy). **Nunca** coloque no GitHub |

## Para quem for mexer no código

```
server/            servidor (Node + Express)
  app.js           monta as rotas e serve o app
  db.js            banco: SQLite embutido ou Postgres (DATABASE_URL)
  auth.js          senha (scrypt) e sessão em cookie httpOnly
  pluggy.js        cliente da API de Open Finance (Pluggy)
  routes/          account, transactions (+ resumo e avisos), data (import/backup), openfinance
public/            o app (PWA), em JavaScript puro, sem build
  js/core/         regras de negócio usadas pelo servidor E pelo app:
                   format (dinheiro/datas), finance (semanas, previsão, dicas, avisos),
                   importers (OFX/CSV), categories
  js/views/        telas
  sw.js            service worker (offline). Aumente VERSION quando mudar arquivos
test/              testes automáticos (rodam no SQLite e no Postgres)
scripts/smoke.mjs  abre o app num celular simulado e passa por todas as telas
```

```bash
npm test        # testes da API e das regras (SQLite + Postgres)
npm run smoke   # teste no navegador (precisa do Playwright)
npm run dev     # servidor reiniciando sozinho ao salvar
npm run icons   # regera os ícones a partir do SVG do logo
```

Valores em dinheiro são guardados em **centavos** (inteiros) para não ter erro de arredondamento.
