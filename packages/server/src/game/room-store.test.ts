import assert from "node:assert/strict";
import test from "node:test";

import {
  CHOOSE_WORD_DURATION_MS,
  DEFAULT_ROUND_TIMER_SECONDS,
  DEFAULT_TOTAL_ROUNDS,
  GamePhase,
  INTERMISSION_DURATION_MS,
  RoomErrorCode,
  TurnStage,
  getHintRevealDelayMs,
  getRoundTimerDurationMs
} from "@party-game/shared";

import { RoomStore } from "./room-store.js";

const createStartedRoom = (
  playerNames = ["Host", "Guest"],
  settings?: { totalRounds: number; roundTimerSeconds: number }
) => {
  const store = new RoomStore();
  const socketIds = playerNames.map((_, index) => `socket-${index + 1}`);

  const created = store.createRoom(socketIds[0]!, {
    playerName: playerNames[0]!,
    playerSessionId: "session-1"
  });
  if (!created.ok) {
    assert.fail(created.error.message);
  }

  const roomCode = created.room.roomCode;
  for (let index = 1; index < playerNames.length; index += 1) {
    const joined = store.joinRoom(socketIds[index]!, {
      playerName: playerNames[index]!,
      playerSessionId: `session-${index + 1}`,
      roomCode
    });
    if (!joined.ok) {
      assert.fail(joined.error.message);
    }
  }

  if (settings) {
    const updated = store.updateLobbySettings(socketIds[0]!, settings);
    if (!updated.ok) {
      assert.fail(updated.error.message);
    }
  }

  const started = store.startGame(socketIds[0]!);
  if (!started.ok) {
    assert.fail(started.error.message);
  }

  return {
    roomCode,
    socketIds,
    store
  };
};

const chooseFirstWord = (store: RoomStore, drawerSocketId: string) => {
  const drawerState = store.getDrawerStateForSocketId(drawerSocketId);
  assert.ok(drawerState);
  const chosenWord = drawerState.wordChoices[0];
  assert.ok(chosenWord);
  const result = store.chooseWord(drawerSocketId, {
    word: chosenWord
  });
  if (!result.ok) {
    assert.fail(result.error.message);
  }

  return chosenWord;
};

const assertDeadlineWithin = (deadline: number | null | undefined, expectedDurationMs: number) => {
  assert.ok(typeof deadline === "number");
  const remainingMs = deadline - Date.now();
  assert.ok(
    remainingMs <= expectedDurationMs && remainingMs >= expectedDurationMs - 1_500,
    `expected remaining duration near ${expectedDurationMs}ms, got ${remainingMs}ms`
  );
};

test("room creation initializes default lobby settings", () => {
  const store = new RoomStore();
  const created = store.createRoom("socket-1", {
    playerName: "Host",
    playerSessionId: "session-1"
  });
  if (!created.ok) {
    assert.fail(created.error.message);
  }

  assert.deepEqual(created.room.settings, {
    totalRounds: DEFAULT_TOTAL_ROUNDS,
    roundTimerSeconds: DEFAULT_ROUND_TIMER_SECONDS
  });
});

test("host can update lobby settings before the game starts", () => {
  const store = new RoomStore();
  const created = store.createRoom("socket-1", {
    playerName: "Host",
    playerSessionId: "session-1"
  });
  if (!created.ok) {
    assert.fail(created.error.message);
  }

  const updated = store.updateLobbySettings("socket-1", {
    totalRounds: 7,
    roundTimerSeconds: 90
  });
  if (!updated.ok) {
    assert.fail(updated.error.message);
  }

  assert.deepEqual(updated.room.settings, {
    totalRounds: 7,
    roundTimerSeconds: 90
  });
});

test("non-hosts cannot update lobby settings", () => {
  const store = new RoomStore();
  const created = store.createRoom("socket-1", {
    playerName: "Host",
    playerSessionId: "session-1"
  });
  if (!created.ok) {
    assert.fail(created.error.message);
  }

  const joined = store.joinRoom("socket-2", {
    playerName: "Guest",
    playerSessionId: "session-2",
    roomCode: created.room.roomCode
  });
  if (!joined.ok) {
    assert.fail(joined.error.message);
  }

  const updated = store.updateLobbySettings("socket-2", {
    totalRounds: 7,
    roundTimerSeconds: 90
  });
  assert.equal(updated.ok, false);
  if (updated.ok) {
    assert.fail("lobby settings update unexpectedly succeeded");
  }

  assert.equal(updated.error.code, RoomErrorCode.NotHost);
});

test("invalid lobby settings values are rejected", () => {
  const store = new RoomStore();
  const created = store.createRoom("socket-1", {
    playerName: "Host",
    playerSessionId: "session-1"
  });
  if (!created.ok) {
    assert.fail(created.error.message);
  }

  const updated = store.updateLobbySettings("socket-1", {
    totalRounds: 10,
    roundTimerSeconds: 30
  });
  assert.equal(updated.ok, false);
  if (updated.ok) {
    assert.fail("lobby settings update unexpectedly succeeded");
  }

  assert.equal(updated.error.code, RoomErrorCode.InvalidLobbySettings);
});

test("correct guesses award points and rotate to the next drawer", () => {
  const { roomCode, socketIds, store } = createStartedRoom();

  const selectedWord = chooseFirstWord(store, socketIds[0]!);
  const guessed = store.submitGuess(socketIds[1]!, {
    guess: selectedWord
  });
  if (!guessed.ok) {
    assert.fail(guessed.error.message);
  }

  assert.equal(guessed.shouldAdvance, true);

  const intermissionRoom = store.finishCurrentTurn(roomCode, "all_guessed");
  assert.ok(intermissionRoom?.activeGame);
  assert.equal(intermissionRoom?.activeGame?.turnStage, TurnStage.Intermission);

  const nextTurnRoom = store.advanceTurn(roomCode);
  assert.ok(nextTurnRoom?.activeGame);
  assert.equal(nextTurnRoom?.activeGame?.turnStage, TurnStage.ChoosingWord);
  assert.equal(nextTurnRoom?.activeGame?.currentDrawerPlayerId, nextTurnRoom?.players[1]?.id);

  const host = nextTurnRoom?.players.find((player) => player.name === "Host");
  const guest = nextTurnRoom?.players.find((player) => player.name === "Guest");
  assert.equal(host?.score, 50);
  assert.equal(guest?.score, 120);
});

test("game start and automatic word choice set the expected phase timers", () => {
  const { roomCode, socketIds, store } = createStartedRoom(["Host", "Guest"], {
    totalRounds: 7,
    roundTimerSeconds: 90
  });

  const roomAfterStart = store.getRoomByCode(roomCode);
  assert.equal(roomAfterStart?.activeGame?.turnStage, TurnStage.ChoosingWord);
  assert.equal(roomAfterStart?.activeGame?.totalRounds, 7);
  assertDeadlineWithin(roomAfterStart?.activeGame?.phaseEndsAt, CHOOSE_WORD_DURATION_MS);

  const autoChosenRoom = store.autoChooseWord(roomCode);
  assert.equal(autoChosenRoom?.activeGame?.turnStage, TurnStage.Drawing);
  assertDeadlineWithin(autoChosenRoom?.activeGame?.phaseEndsAt, getRoundTimerDurationMs(90));
  assert.ok(autoChosenRoom?.activeGame?.wordMask);
  assert.equal(store.getDrawerStateForSocketId(socketIds[1]!), null);
});

test("hint reveal timing scales with the selected round timer", () => {
  assert.equal(getHintRevealDelayMs(45), 30_000);
  assert.equal(getHintRevealDelayMs(60), 40_000);
  assert.equal(getHintRevealDelayMs(75), 50_000);
  assert.equal(getHintRevealDelayMs(90), 60_000);
});

test("time-up finish reveals the word and starts intermission with a short deadline", () => {
  const { roomCode, socketIds, store } = createStartedRoom();

  const selectedWord = chooseFirstWord(store, socketIds[0]!);
  const roomAfterTimeout = store.finishCurrentTurn(roomCode, "time_up");

  assert.equal(roomAfterTimeout?.activeGame?.turnStage, TurnStage.Intermission);
  assert.equal(roomAfterTimeout?.activeGame?.revealedWord, selectedWord);
  assertDeadlineWithin(roomAfterTimeout?.activeGame?.phaseEndsAt, INTERMISSION_DURATION_MS);
  assert.match(roomAfterTimeout?.chatMessages.at(-1)?.text ?? "", /time is up/i);
});

test("revealing a hint letter updates the mask after the hint point", () => {
  const { roomCode, socketIds, store } = createStartedRoom();

  const selectedWord = chooseFirstWord(store, socketIds[0]!);
  const roomAfterHint = store.revealHintLetter(roomCode);

  assert.ok(roomAfterHint?.activeGame);
  assert.equal(roomAfterHint?.activeGame?.turnStage, TurnStage.Drawing);
  assert.equal(roomAfterHint?.activeGame?.revealedLetterIndices.length, 1);
  assert.ok(roomAfterHint?.activeGame?.wordMask);
  assert.notEqual(roomAfterHint?.activeGame?.wordMask, "_ ".repeat(selectedWord.length).trim());
  assert.match(roomAfterHint?.chatMessages.at(-1)?.text ?? "", /letter has been revealed/i);
});

test("drawer disconnect during drawing ends the turn in intermission and reveals the word", () => {
  const { socketIds, store } = createStartedRoom(["Host", "Guest1", "Guest2"]);

  const selectedWord = chooseFirstWord(store, socketIds[0]!);
  const roomAfterDisconnect = store.removePlayerBySocketId(socketIds[0]!);

  assert.ok(roomAfterDisconnect?.activeGame);
  assert.equal(roomAfterDisconnect?.phase, GamePhase.Playing);
  assert.equal(roomAfterDisconnect?.activeGame?.turnStage, TurnStage.Intermission);
  assert.equal(roomAfterDisconnect?.activeGame?.revealedWord, selectedWord);
  assert.match(roomAfterDisconnect?.chatMessages.at(-1)?.text ?? "", /left during the turn/i);
  assert.equal(store.getDrawerStateForSocketId(socketIds[1]!), null);
});

test("disconnect marks a player disconnected instead of removing them immediately", () => {
  const store = new RoomStore();
  const created = store.createRoom("socket-1", {
    playerName: "Host",
    playerSessionId: "session-1"
  });
  if (!created.ok) {
    assert.fail(created.error.message);
  }

  const joined = store.joinRoom("socket-2", {
    playerName: "Guest",
    playerSessionId: "session-2",
    roomCode: created.room.roomCode
  });
  if (!joined.ok) {
    assert.fail(joined.error.message);
  }

  const disconnected = store.markPlayerDisconnected("socket-2");
  assert.ok(disconnected);
  assert.equal(disconnected.room.players.length, 2);
  assert.equal(disconnected.playerId, joined.playerId);
  assert.equal(
    disconnected.room.players.find((player) => player.id === joined.playerId)?.isConnected,
    false
  );
});

test("same reconnect token can reclaim a disconnected player during an active game", () => {
  const { roomCode, socketIds, store } = createStartedRoom(["Host", "Guest"]);

  const disconnected = store.markPlayerDisconnected(socketIds[1]!);
  assert.ok(disconnected);

  const rejoined = store.joinRoom("socket-reconnected", {
    playerName: "Guest",
    playerSessionId: "session-2",
    roomCode
  });
  if (!rejoined.ok) {
    assert.fail(rejoined.error.message);
  }

  assert.equal(rejoined.playerId, disconnected.playerId);
  assert.equal(
    rejoined.room.players.find((player) => player.id === disconnected.playerId)?.isConnected,
    true
  );
});

test("disconnect expiry removes a still-disconnected player", () => {
  const store = new RoomStore();
  const created = store.createRoom("socket-1", {
    playerName: "Host",
    playerSessionId: "session-1"
  });
  if (!created.ok) {
    assert.fail(created.error.message);
  }

  const joined = store.joinRoom("socket-2", {
    playerName: "Guest",
    playerSessionId: "session-2",
    roomCode: created.room.roomCode
  });
  if (!joined.ok) {
    assert.fail(joined.error.message);
  }

  const disconnected = store.markPlayerDisconnected("socket-2");
  assert.ok(disconnected);

  const expired = store.expireDisconnectedPlayer(joined.playerId);
  assert.ok(expired);
  assert.equal(expired.room?.players.length, 1);
  assert.equal(expired.room?.players.some((player) => player.id === joined.playerId), false);
});

test("duplicate names are still rejected for new players without the reconnect token", () => {
  const store = new RoomStore();
  const created = store.createRoom("socket-1", {
    playerName: "Host",
    playerSessionId: "session-1"
  });
  if (!created.ok) {
    assert.fail(created.error.message);
  }

  const joined = store.joinRoom("socket-2", {
    playerName: "Guest",
    playerSessionId: "session-2",
    roomCode: created.room.roomCode
  });
  if (!joined.ok) {
    assert.fail(joined.error.message);
  }

  store.markPlayerDisconnected("socket-2");

  const duplicateJoin = store.joinRoom("socket-3", {
    playerName: "Guest",
    playerSessionId: "session-3",
    roomCode: created.room.roomCode
  });

  assert.equal(duplicateJoin.ok, false);
  if (duplicateJoin.ok) {
    assert.fail("duplicate join unexpectedly succeeded");
  }

  assert.equal(duplicateJoin.error.code, RoomErrorCode.DuplicateName);
});

test("guesser disconnect during drawing can end the turn when all remaining guessers are done", () => {
  const { roomCode, socketIds, store } = createStartedRoom(["Host", "Guest1", "Guest2"]);

  const selectedWord = chooseFirstWord(store, socketIds[0]!);
  const guessed = store.submitGuess(socketIds[1]!, {
    guess: selectedWord
  });
  if (!guessed.ok) {
    assert.fail(guessed.error.message);
  }

  const roomAfterDisconnect = store.removePlayerBySocketId(socketIds[2]!);

  assert.ok(roomAfterDisconnect?.activeGame);
  assert.equal(roomAfterDisconnect?.activeGame?.turnStage, TurnStage.Intermission);
  assert.equal(roomAfterDisconnect?.activeGame?.revealedWord, selectedWord);
  assert.deepEqual(
    roomAfterDisconnect?.chatMessages.slice(-2).map((message) => message.text),
    ["Guest2 left the room.", "Everyone guessed correctly. Next turn starting soon..."]
  );

  const nextTurnRoom = store.advanceTurn(roomCode);
  assert.ok(nextTurnRoom?.activeGame);
  assert.equal(nextTurnRoom?.activeGame?.turnStage, TurnStage.ChoosingWord);
});

test("host can return a finished room to the lobby and reset scores", () => {
  const { roomCode, socketIds, store } = createStartedRoom(["Host", "Guest"], {
    totalRounds: 3,
    roundTimerSeconds: 90
  });

  for (let turnIndex = 0; turnIndex < 6; turnIndex += 1) {
    const roomBeforeTurn = store.getRoomByCode(roomCode);
    const activeDrawerId = roomBeforeTurn?.activeGame?.currentDrawerPlayerId;
    assert.ok(activeDrawerId);
    const drawerSocketId =
      socketIds[roomBeforeTurn?.players.findIndex((player) => player.id === activeDrawerId) ?? -1];
    assert.ok(drawerSocketId);
    const selectedWord = chooseFirstWord(store, drawerSocketId);

    const guesserSocketId = socketIds.find((socketId) => socketId !== drawerSocketId);
    assert.ok(guesserSocketId);
    const guessed = store.submitGuess(guesserSocketId, {
      guess: selectedWord
    });
    if (!guessed.ok) {
      assert.fail(guessed.error.message);
    }

    store.finishCurrentTurn(roomCode, "all_guessed");
    store.advanceTurn(roomCode);
  }

  const finishedRoom = store.getRoomByCode(roomCode);
  assert.equal(finishedRoom?.phase, GamePhase.Finished);

  const resetResult = store.returnRoomToLobby(socketIds[0]!);
  if (!resetResult.ok) {
    assert.fail(resetResult.error.message);
  }

  assert.equal(resetResult.room.phase, GamePhase.Lobby);
  assert.equal(resetResult.room.activeGame, null);
  assert.equal(resetResult.room.chatMessages.length, 0);
  assert.deepEqual(resetResult.room.settings, {
    totalRounds: 3,
    roundTimerSeconds: 90
  });
  assert.ok(resetResult.room.players.every((player) => player.score === 0));
});

test("lobby settings cannot be changed after the game starts", () => {
  const { socketIds, store } = createStartedRoom();

  const updated = store.updateLobbySettings(socketIds[0]!, {
    totalRounds: 4,
    roundTimerSeconds: 75
  });
  assert.equal(updated.ok, false);
  if (updated.ok) {
    assert.fail("lobby settings update unexpectedly succeeded");
  }

  assert.equal(updated.error.code, RoomErrorCode.InvalidGameState);
});

test("host disconnect in lobby reassigns the host to the next player", () => {
  const store = new RoomStore();
  const created = store.createRoom("socket-1", {
    playerName: "Host",
    playerSessionId: "session-1"
  });
  if (!created.ok) {
    assert.fail(created.error.message);
  }

  const joined = store.joinRoom("socket-2", {
    playerName: "Guest",
    playerSessionId: "session-2",
    roomCode: created.room.roomCode
  });
  if (!joined.ok) {
    assert.fail(joined.error.message);
  }

  const roomAfterDisconnect = store.removePlayerBySocketId("socket-1");
  assert.equal(roomAfterDisconnect?.phase, GamePhase.Lobby);
  assert.equal(roomAfterDisconnect?.hostPlayerId, roomAfterDisconnect?.players[0]?.id ?? null);
  assert.match(roomAfterDisconnect?.chatMessages.at(-1)?.text ?? "", /is now the host/i);
});

test("removing the last player deletes the room", () => {
  const store = new RoomStore();
  const created = store.createRoom("socket-1", {
    playerName: "Solo",
    playerSessionId: "session-1"
  });
  if (!created.ok) {
    assert.fail(created.error.message);
  }

  const roomCode = created.room.roomCode;
  const roomAfterDisconnect = store.removePlayerBySocketId("socket-1");

  assert.equal(roomAfterDisconnect, null);
  assert.equal(store.getRoomByCode(roomCode), null);
});

test("guesses submitted before drawing starts are rejected", () => {
  const { socketIds, store } = createStartedRoom();

  const guessed = store.submitGuess(socketIds[1]!, {
    guess: "anything"
  });

  assert.equal(guessed.ok, false);
  if (guessed.ok) {
    assert.fail("guess unexpectedly succeeded");
  }

  assert.equal(guessed.error.code, RoomErrorCode.NotGuessingPhase);
});
