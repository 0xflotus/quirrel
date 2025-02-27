import type { FastifyPluginCallback, FastifyRequest } from "fastify";
import fastifyWebsocket from "fastify-websocket";
import { JobsRepo } from "../jobs-repo";

// https://stackoverflow.com/questions/4361173/http-headers-in-websockets-client-api
function workAroundWebsocketAuth(req: FastifyRequest) {
  const authToken = req.headers["sec-websocket-protocol"];
  if (!req.headers.authorization) {
    req.headers.authorization = `Bearer ${authToken}`;
  }
}

const activityPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.register(fastifyWebsocket);

  const jobsRepo = new JobsRepo(fastify.owl);

  fastify.get(
    "/",
    {
      websocket: true,
      schema: {
        tags: ["DX"],
        summary: "Activity feed, published as websocket",
        description: "Token is passed via Websocket protocol.",
        security: fastify.authEnabled
          ? [
              {
                Admin: [],
                Impersonation: [],
              },
            ]
          : undefined,
      },
    },
    async (connection, req) => {
      workAroundWebsocketAuth(req);

      const tokenId = await fastify.tokenAuth.authenticate(req);

      if (!tokenId) {
        connection.socket.close();
        return;
      }

      const close = jobsRepo.onEvent(tokenId, (event, job) => {
        connection.socket.send(JSON.stringify([event, job]));
      });

      connection.on("close", close);
    }
  );

  fastify.addHook("onClose", async () => {
    await jobsRepo.close();
  });

  done();
};

export default activityPlugin;
