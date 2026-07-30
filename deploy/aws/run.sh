#!/bin/bash
# Lambda handler entry when running behind the AWS Lambda Web Adapter.
# The adapter (attached as a layer, invoked via AWS_LAMBDA_EXEC_WRAPPER) execs
# this script as a plain shell command instead of the Node runtime trying to
# require/import it — nitro's node-server preset output (index.mjs) is a
# normal long-running HTTP server, not a Lambda handler export.
# See docs/AWS_DEPLOY.md for the one-time Lambda console setup.
exec node index.mjs
