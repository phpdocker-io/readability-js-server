"use strict";

const { fork } = require("node:child_process");
const path = require("node:path");

const WORKER_SCRIPT = path.join(__dirname, "parser-worker.js");

function createParserPool(maxParses = 500) {
  let child = null;
  let childReady = false;
  let recycleRequested = false;
  let readyResolvers = [];
  const pending = new Map();
  let nextId = 0;

  function spawn() {
    childReady = false;
    recycleRequested = false;
    child = fork(WORKER_SCRIPT, [], {
      env: { ...process.env, PARSER_MAX_PARSES: String(maxParses) },
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

    if (msg.type === "recycle") {
      recycleRequested = true;
      maybeRecycle();
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

    if (recycleRequested) {
      maybeRecycle();
    }
  }

  function maybeRecycle() {
    if (!recycleRequested || pending.size > 0) return;

    const old = child;
    child = null;
    childReady = false;
    recycleRequested = false;

    if (old) {
      old.removeAllListeners();
      old.kill();
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
    if (child && childReady && !recycleRequested) {
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
