import { getDeckLeaderboard, getPlayerLeaderboard } from "../service/rating.js";
import { validationError } from "../lib/errors.js";

export async function getPlayerRankings(req, res, next) {
  try {
    if (req.query.limit && Number(req.query.limit) <= 0) {
      throw validationError("limit precisa ser positivo");
    }
    const rankings = await getPlayerLeaderboard(req.query);
    res.status(200).json(rankings);
  } catch (error) {
    next(error);
  }
}

export async function getDeckRankings(req, res, next) {
  try {
    if (req.query.limit && Number(req.query.limit) <= 0) {
      throw validationError("limit precisa ser positivo");
    }
    const rankings = await getDeckLeaderboard(req.query);
    res.status(200).json(rankings);
  } catch (error) {
    next(error);
  }
}
