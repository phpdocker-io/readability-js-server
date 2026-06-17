"use strict";

const { fork } = require("node:child_process");
const path = require("node:path");

const WORKER_SCRIPT = path.join(__dirname, "parser-worker.js");

function createParserPool() {
  let child = null;
  let childReady = false;
  let readyResolvers = [];
  const pending = new Map();
  let nextId = 0;

  function spawn() {
    childReady = false;
    child = fork(WORKER_SCRIPT, [], {
      serialization: "advanced",
      stdio: "inherit",
    });
    child.unref();
    child.channel.unref();

    child.on("message", onMessage);
    child.on("error", onError);
    child.on("exit", onExit);
  }

  function onMessage(msg) {
    if (msg.type === "ready") {
      childReady = true;
      for (const resolve of readyResolvers) resolve();
      readyResolvers = [];
      return;
    }

    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);

    if (msg.error) {
      entry.reject(new Error(msg.error.message));
    } else {
      entry.resolve(msg.result);
    }

    if (pending.size === 0 && child) {
      child.unref();
      child.channel.unref();
    }
  }

  function onError(err) {
    rejectAll(err);
    child = null;
    childReady = false;
  }

  function onExit() {
    rejectAll(new Error("Parser process exited unexpectedly"));
    child = null;
    childReady = false;
  }

  function rejectAll(err) {
    for (const entry of pending.values()) {
      entry.reject(err);
    }
    pending.clear();
  }

  function ensureChild() {
    if (child && childReady) {
      return Promise.resolve();
    }
    if (child && !childReady) {
      return new Promise((r) => readyResolvers.push(r));
    }
    spawn();
    return new Promise((r) => readyResolvers.push(r));
  }

  function parse(html, url, config, contentFormat) {
    const id = nextId;
    nextId += 1;

    return ensureChild().then(() => {
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        if (child) {
          child.ref();
          child.channel.ref();
        }
        child.send({ id, html, url, config, contentFormat });
      });
    });
  }

  return { parse };
}

module.exports = { createParserPool };
