# Coparty API MVP

## Fluxo 1v1

1. `POST /api/users`
```json
{
  "username": "player1",
  "email": "player1@test.com",
  "password": "123456"
}
```

2. `POST /api/users/login`
```json
{
  "login": "player1",
  "password": "123456"
}
```

3. `POST /api/players`
```json
{
  "displayName": "Player One"
}
```

4. `POST /api/decks/me`
```json
{
  "name": "Modern Deck",
  "format": "MODERN",
  "link": "https://example.com/deck"
}
```

5. `POST /api/events`
```json
{
  "name": "Friday Modern",
  "description": "Torneio 1v1",
  "dateTime": "2099-01-01T19:00:00.000Z",
  "pairingType": "SWISS",
  "status": "SCHEDULED",
  "gameMode": "ONE_VS_ONE",
  "maxPlayers": 32
}
```

6. `POST /api/events/:eventId/entries`
```json
{
  "deckId": "DECK_ID"
}
```

7. `POST /api/events/:eventId/rounds/1/generate`

8. `PATCH /api/matches/:matchId/result`
```json
{
  "participants": [
    {
      "eventEntryId": "ENTRY_1",
      "resultType": "WIN",
      "placement": 1,
      "score": 2,
      "pointsEarned": 3,
      "isWinner": true,
      "eliminations": 0
    },
    {
      "eventEntryId": "ENTRY_2",
      "resultType": "LOSS",
      "placement": 2,
      "score": 0,
      "pointsEarned": 0,
      "isWinner": false,
      "eliminations": 0
    }
  ]
}
```

9. `PATCH /api/matches/:matchId/status`
```json
{
  "status": "COMPLETED"
}
```

10. `POST /api/events/:eventId/rounds/1/close`

11. `GET /api/events/:eventId/standings`

12. `GET /api/rankings/players?gameMode=ONE_VS_ONE`

## Fluxo Commander

1. Crie o evento com `gameMode = COMMANDER_MULTIPLAYER`
```json
{
  "name": "Commander League",
  "description": "Mesas multiplayer",
  "dateTime": "2099-01-02T19:00:00.000Z",
  "pairingType": "SWISS",
  "status": "SCHEDULED",
  "gameMode": "COMMANDER_MULTIPLAYER",
  "maxPlayers": 24
}
```

2. Entre no evento usando `POST /api/events/:eventId/entries` com deck Commander

3. Gere a rodada com `POST /api/events/:eventId/rounds/:round/generate`

4. Registre resultado multiplayer
```json
{
  "participants": [
    {
      "eventEntryId": "ENTRY_1",
      "resultType": "WIN",
      "placement": 1,
      "score": 4,
      "pointsEarned": 5,
      "isWinner": true,
      "eliminations": 2
    },
    {
      "eventEntryId": "ENTRY_2",
      "resultType": "LOSS",
      "placement": 2,
      "score": 3,
      "pointsEarned": 3,
      "isWinner": false,
      "eliminations": 1
    },
    {
      "eventEntryId": "ENTRY_3",
      "resultType": "LOSS",
      "placement": 3,
      "score": 2,
      "pointsEarned": 2,
      "isWinner": false,
      "eliminations": 0
    },
    {
      "eventEntryId": "ENTRY_4",
      "resultType": "LOSS",
      "placement": 4,
      "score": 1,
      "pointsEarned": 1,
      "isWinner": false,
      "eliminations": 0
    }
  ]
}
```

5. Finalize a match e feche a rodada

6. Consulte:
- `GET /api/events/:eventId/standings`
- `GET /api/rankings/players?gameMode=COMMANDER_MULTIPLAYER`
- `GET /api/rankings/decks?gameMode=COMMANDER_MULTIPLAYER`

## Regras de Standings

- Somente matches `COMPLETED` contam.
- 1v1:
  - `WIN` ou `BYE` = 3 pontos
  - `DRAW` = 1 ponto
  - `LOSS` = 0 ponto
- Commander:
  - `placement 1` = 5 pontos
  - `placement 2` = 3 pontos
  - `placement 3` = 2 pontos
  - `placement 4` = 1 ponto

## Regras de Ranking

- O ranking e separado por `ratingType`, `gameMode` e `format`.
- 1v1:
  - `WIN/BYE` = +10
  - `DRAW` = +3
  - `LOSS` = +0
- Commander:
  - `placement 1` = +12
  - `placement 2` = +6
  - `placement 3` = +3
  - `placement 4` = +1

## Acoes Administrativas

- Reabrir match concluida:
  - `PATCH /api/matches/:matchId/reopen`
- Rebuild de rankings:
  - `POST /api/admin/rebuild`
  - `POST /api/admin/rebuild/event/:eventId`
  - `POST /api/admin/rebuild/round/:eventId/:round`
  - `POST /api/admin/rebuild/match/:matchId`

## Auditoria

As operacoes abaixo geram log estruturado e persistente em `AuditLog`:
- geracao de rodada
- envio de resultado
- mudanca de status da match
- reabertura de match
- fechamento de rodada
- atualizacao/rebuild de rating
