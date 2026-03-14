# Coparty Domain Examples

## Evento 1v1

```json
{
  "name": "Modern Showdown",
  "description": "Evento competitivo 1v1",
  "dateTime": "2026-04-10T19:30:00.000Z",
  "pairingType": "SWISS",
  "status": "SCHEDULED",
  "gameMode": "ONE_VS_ONE",
  "maxPlayers": 32,
  "createdByUserId": "67d3b3f12c55f58cc1a1aa01"
}
```

## Evento 2v2

```json
{
  "name": "2v2 Team Cup",
  "description": "Equipes de dois jogadores",
  "dateTime": "2026-05-15T14:00:00.000Z",
  "pairingType": "SWISS",
  "status": "SCHEDULED",
  "gameMode": "TWO_VS_TWO",
  "maxPlayers": 16,
  "createdByUserId": "67d3b3f12c55f58cc1a1aa01"
}
```

## Match Commander Multiplayer com 4 players

```json
{
  "entries": [
    {
      "eventId": "67d3b63a2c55f58cc1a1aa10",
      "entryType": "PLAYER",
      "playerId": "67d3b4ac2c55f58cc1a1aa05",
      "teamId": null,
      "deckId": "67d3b8ad2c55f58cc1a1aa31",
      "status": "REGISTERED"
    },
    {
      "eventId": "67d3b63a2c55f58cc1a1aa10",
      "entryType": "PLAYER",
      "playerId": "67d3b4ac2c55f58cc1a1aa06",
      "teamId": null,
      "deckId": "67d3b8ad2c55f58cc1a1aa32",
      "status": "REGISTERED"
    }
  ],
  "match": {
    "eventId": "67d3b63a2c55f58cc1a1aa10",
    "round": 1,
    "tableNumber": 7,
    "status": "COMPLETED",
    "startedAt": "2026-05-15T18:00:00.000Z",
    "finishedAt": "2026-05-15T19:35:00.000Z",
    "notes": "Mesa de 4 jogadores"
  },
  "participants": [
    {
      "eventEntryId": "67d3b7e42c55f58cc1a1aa21",
      "seatOrder": 1,
      "resultType": "WIN",
      "placement": 1,
      "pointsEarned": 3,
      "isWinner": true,
      "eliminations": 2
    },
    {
      "eventEntryId": "67d3b7e42c55f58cc1a1aa22",
      "seatOrder": 2,
      "resultType": "LOSS",
      "placement": 2,
      "pointsEarned": 1,
      "isWinner": false,
      "eliminations": 1
    },
    {
      "eventEntryId": "67d3b7e42c55f58cc1a1aa23",
      "seatOrder": 3,
      "resultType": "LOSS",
      "placement": 3,
      "pointsEarned": 0,
      "isWinner": false,
      "eliminations": 0
    },
    {
      "eventEntryId": "67d3b7e42c55f58cc1a1aa24",
      "seatOrder": 4,
      "resultType": "ELIMINATED",
      "placement": 4,
      "pointsEarned": 0,
      "isWinner": false,
      "eliminations": 0
    }
  ]
}
```

## EventEntry valido para PLAYER

```json
{
  "eventId": "67d3b63a2c55f58cc1a1aa10",
  "entryType": "PLAYER",
  "playerId": "67d3b4ac2c55f58cc1a1aa05",
  "teamId": null,
  "deckId": "67d3b8ad2c55f58cc1a1aa31",
  "status": "REGISTERED"
}
```

## EventEntry invalido para PLAYER sem deck

```json
{
  "eventId": "67d3b63a2c55f58cc1a1aa10",
  "entryType": "PLAYER",
  "playerId": "67d3b4ac2c55f58cc1a1aa05",
  "teamId": null,
  "deckId": null
}
```

## EventEntry invalido para TEAM com deck

```json
{
  "eventId": "67d3b63a2c55f58cc1a1aa10",
  "entryType": "TEAM",
  "playerId": null,
  "teamId": "67d3b9f52c55f58cc1a1aa40",
  "deckId": "67d3b8ad2c55f58cc1a1aa31"
}
```

## Rating de player

```json
{
  "ratingType": "PLAYER",
  "playerId": "67d3b4ac2c55f58cc1a1aa05",
  "deckId": null,
  "gameMode": "ONE_VS_ONE",
  "format": "MODERN",
  "rating": 1542,
  "rd": 55,
  "volatility": 0.06,
  "matchesPlayed": 18
}
```

## Rating de deck

```json
{
  "ratingType": "DECK",
  "playerId": null,
  "deckId": "67d3b8ad2c55f58cc1a1aa31",
  "gameMode": "COMMANDER_MULTIPLAYER",
  "format": "COMMANDER",
  "rating": 1610,
  "rd": 48,
  "volatility": 0.05,
  "matchesPlayed": 11
}
```

## Rating history

```json
{
  "ratingType": "PLAYER",
  "playerId": "67d3b4ac2c55f58cc1a1aa05",
  "deckId": null,
  "matchId": "67d3ba0d2c55f58cc1a1aa41",
  "oldRating": 1530,
  "newRating": 1542,
  "delta": 12,
  "calculatedAt": "2026-05-15T19:36:00.000Z"
}
```
