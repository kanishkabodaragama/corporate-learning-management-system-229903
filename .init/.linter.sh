#!/bin/bash
cd /home/kavia/workspace/code-generation/corporate-learning-management-system-229903/lms_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

