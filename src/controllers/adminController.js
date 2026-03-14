import { parsePositiveInteger } from "../lib/validation.js";
import { rebuildRatingsFromResults } from "../service/rating.js";

export async function rebuildCompetitiveData(req, res, next) {
  try {
    const result = await rebuildRatingsFromResults({}, {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function rebuildCompetitiveDataByEvent(req, res, next) {
  try {
    const result = await rebuildRatingsFromResults({ eventId: req.params.eventId }, {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function rebuildCompetitiveDataByRound(req, res, next) {
  try {
    const round = parsePositiveInteger(req.params.round, "round");
    const result = await rebuildRatingsFromResults({ eventId: req.params.eventId, round }, {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function rebuildCompetitiveDataByMatch(req, res, next) {
  try {
    const result = await rebuildRatingsFromResults({ matchId: req.params.matchId }, {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
