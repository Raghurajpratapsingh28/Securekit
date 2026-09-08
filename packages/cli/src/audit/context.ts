import type { DeploymentHints } from "./types.js";

export function detectDeploymentHints(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentHints {
  const kubernetes = env.KUBERNETES_SERVICE_HOST !== undefined;
  const replicaCount = parseReplicaCount(env);
  const horizontallyScaled =
    kubernetes ||
    replicaCount !== undefined && replicaCount > 1 ||
    env.HEROKU_APP_NAME !== undefined ||
    env.AWS_EXECUTION_ENV !== undefined ||
    env.ECS_CONTAINER_METADATA_URI !== undefined ||
    env.ECS_CONTAINER_METADATA_URI_V4 !== undefined ||
    env.K_SERVICE !== undefined ||
    env.CF_INSTANCE_INDEX !== undefined;

  return {
    horizontallyScaled,
    kubernetes,
    replicaCount,
  };
}

function parseReplicaCount(env: NodeJS.ProcessEnv): number | undefined {
  const candidates = [
    env.WEB_CONCURRENCY,
    env.PM2_INSTANCES,
    env.KUBERNETES_REPLICA_COUNT,
    env.REPLICAS,
  ];

  for (const value of candidates) {
    if (value === undefined || value.length === 0) {
      continue;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}
