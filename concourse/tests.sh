#!/usr/bin/env bash

# Ensure we exit with failure if anything here fails
set -e

INITIAL_FOLDER=`pwd`

# cd into the codebase, as per CI source
cd code
mkdir reports


#### HERE GOES TEST RUNNING AND COVERAGE GENERATION

# Go back to initial working dir to allow outputs to function
cd ${INITIAL_FOLDER}

# Copy reports to output
cp code/reports/* coverage-reports/ -Rf
