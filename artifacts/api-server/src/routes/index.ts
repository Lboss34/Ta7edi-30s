import { Router, type IRouter } from "express";
import healthRouter from "./health";
import questionsRouter from "./questions";
import leaderboardRouter from "./leaderboard";
import authRouter from "./auth";
import friendsRouter from "./friends";

const router: IRouter = Router();

router.use(healthRouter);
router.use(questionsRouter);
router.use(leaderboardRouter);
router.use(authRouter);
router.use(friendsRouter);

export default router;
