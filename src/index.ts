import express from "express";
import bodyParser from "body-parser";
import Knex from "knex";
import nunjucks from "nunjucks";
import dayjs from "dayjs";

(async () => {
  const app = express();

  const knex = Knex({
    client: "sqlite3",
    connection: {
      filename: "./database.sqlite"
    }
  });

  try {
    await knex("requests")
      .select()
      .limit(1);
  } catch (err) {
    if (err.message.includes("no such table")) {
      await knex.schema.createTable("requests", table => {
        table.increments("id");
        table.string("name");
        table.integer("duration");
        table.integer("startTime");
      });
    } else {
      throw err;
    }
  }

  app.post("/batch", bodyParser.json(), async (req, res) => {
    await knex("requests").insert(
      req.body.requests.map((r: any) => ({
        name: r.name,
        duration: r.duration,
        startTime: r.startTime
      }))
    );
    return res.send({ ok: true });
  });

  nunjucks.configure("views", {
    autoescape: true,
    express: app
  });
  app.get("/chart/:name/:size", async (req, res) => {
    const { name, size } = req.params;
    if (!["day", "week", "month"].includes(size)) {
      return res.status(400).send("bad size format");
    }
    const requests = await knex("requests")
      .select("name", "duration", "startTime")
      .whereBetween("startTime", [
        dayjs()
          .startOf(size as any)
          .valueOf(),
        dayjs()
          .endOf(size as any)
          .valueOf()
      ])
      .where("name", name)
      .orderBy("startTime", "asc");
    return res.render("chart.njk", {
      name,
      data: requests.map(x => [x.startTime, x.duration]),
      numRequests: requests.length
    });
  });
  app.get("/", async (_, res) => {
    const requestsInfo = await knex("requests")
      .select(
        "name",
        knex.raw("count(*) as count"),
        knex.raw("avg(duration) as average"),
        knex.raw("min(duration) as min"),
        knex.raw("max(duration) as max")
      )
      .groupBy("name")
      .orderBy("average", "desc");

    const buckets = await knex("requests")
      .select(
        knex.raw("count(*) as count"),
        knex.raw("round(startTime/60000.00)*60000 as minute")
      )
      .groupBy("minute");

    res.render("home.njk", {
      requestsInfo,
      numRequests: requestsInfo.reduce((pv, cv) => pv + cv.count, 0),
      min: dayjs()
        .startOf("day")
        .valueOf(),
      max: dayjs()
        .endOf("day")
        .valueOf(),
      data: buckets.map(x => [x.minute, x.count])
    });
  });

  app.listen(process.env.PORT || 8001, () => {
    console.log("started");
  });
})();
