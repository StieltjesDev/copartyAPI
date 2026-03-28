const DEFAULT_BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DEFAULT_PLAYERS = Number(process.env.PLAYERS || 8);
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || "123456";
const DEFAULT_GAME_MODE = process.env.GAME_MODE || "ONE_VS_ONE";

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    players: DEFAULT_PLAYERS,
    password: DEFAULT_PASSWORD,
    gameMode: DEFAULT_GAME_MODE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--baseUrl" && next) {
      args.baseUrl = next;
      index += 1;
      continue;
    }

    if (current === "--players" && next) {
      args.players = Number(next);
      index += 1;
      continue;
    }

    if (current === "--password" && next) {
      args.password = next;
      index += 1;
      continue;
    }

    if (current === "--gameMode" && next) {
      args.gameMode = next;
      index += 1;
    }
  }

  return args;
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`${options.method || "GET"} ${path} falhou: ${message}`);
  }

  return { response, data };
}

function getCookie(response) {
  return response.headers.get("set-cookie");
}

function buildDeckPayload(index, gameMode) {
  if (gameMode === "COMMANDER_MULTIPLAYER") {
    return {
      name: `Commander Deck ${index}`,
      format: "COMMANDER",
      commander: `Commander Card ${index}`,
      link: `https://www.moxfield.com/decks/commander-deck-${index}`,
    };
  }

  return {
    name: `Modern Deck ${index}`,
    format: "MODERN",
    commander: null,
    link: `https://www.moxfield.com/decks/modern-deck-${index}`,
  };
}

async function createUserFlow(baseUrl, index, suffix, password, gameMode, role = "user") {
  const username = `champ_${suffix}_${index}`;
  const email = `${username}@test.local`;

  await request(baseUrl, "/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username,
      email,
      password,
      role,
    }),
  });

  const login = await request(baseUrl, "/api/users/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      login: username,
      password,
    }),
  });

  const cookie = getCookie(login.response);


  const deck = await request(baseUrl, "/api/decks/me", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(buildDeckPayload(index, gameMode)),
  });

  return {
    username,
    email,
    password,
    cookie,
    deck: deck.data,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const suffix = Date.now();

  if (!Number.isInteger(args.players) || args.players < 2) {
    throw new Error("--players precisa ser um inteiro >= 2");
  }

  if (!["ONE_VS_ONE", "COMMANDER_MULTIPLAYER"].includes(args.gameMode)) {
    throw new Error("--gameMode precisa ser ONE_VS_ONE ou COMMANDER_MULTIPLAYER");
  }

  console.log(`Criando campeonato de teste em ${args.baseUrl}`);
  console.log(`Modo: ${args.gameMode} | Players: ${args.players}`);

  const organizer = await createUserFlow(
    args.baseUrl,
    "organizer",
    suffix,
    args.password,
    args.gameMode,
    "admin",
  );

  const eventResponse = await request(args.baseUrl, "/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: organizer.cookie,
    },
    body: JSON.stringify({
      name: `Championship ${suffix}`,
      description: `Evento de teste com ${args.players} players`,
      dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      pairingType: "SWISS",
      gameMode: args.gameMode,
      maxPlayers: args.players,
    }),
  });

  const eventId = eventResponse.data.id;

  const createdPlayers = [];
  for (let index = 1; index <= args.players; index += 1) {
    const account = await createUserFlow(args.baseUrl, index, suffix, args.password, args.gameMode);
    createdPlayers.push(account);
  }

  for (const account of createdPlayers) {
    await request(args.baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: account.cookie,
      },
      body: JSON.stringify({
        deckId: account.deck._id,
      }),
    });
  }

  await request(args.baseUrl, `/api/events/${eventId}/start`, {
    method: "PATCH",
    headers: { cookie: organizer.cookie },
  });

  const firstRound = await request(args.baseUrl, `/api/events/${eventId}/rounds/1/generate`, {
    method: "POST",
    headers: { cookie: organizer.cookie },
  });

  const standings = await request(args.baseUrl, `/api/events/${eventId}/standings`, {
    headers: { cookie: organizer.cookie },
  });

  console.log("");
  console.log("Seed concluido com sucesso.");
  console.log(`Event ID: ${eventId}`);
  console.log(`Organizer username: ${organizer.username}`);
  console.log(`Organizer password: ${organizer.password}`);
  console.log(`Matches rodada 1: ${firstRound.data.length}`);
  console.log(`Standings atuais: ${standings.data.length} entradas`);
  console.log("");
  console.log("Contas criadas:");
  for (const account of createdPlayers) {
    console.log(`- ${account.username} | ${account.email} | senha: ${account.password}`);
  }
  console.log("");
  console.log("Proximos passos:");
  console.log(`1. Abra o evento ${eventId} no frontend.`);
  console.log("2. Lance os resultados da rodada 1.");
  console.log("3. Feche a rodada.");
  console.log("4. Gere a rodada 2.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

