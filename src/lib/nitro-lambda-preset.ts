/**
 * Nitro 3 docs name the official AWS Lambda preset `aws_lambda`.
 * Older Nitro / some TanStack Start wrappers accepted `aws-lambda`.
 * This repo's installed nitro (see package.json) is 3.0.260603-beta.
 * Use this constant in vite.config.ts so we only change the string once
 * if the installed nitro rejects an alias.
 */
export const NITRO_AWS_LAMBDA_PRESET = "aws-lambda";
