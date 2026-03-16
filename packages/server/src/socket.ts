import type { Server } from "socket.io";

import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type CanvasStroke,
  type ChooseWordInput,
  type CreateRoomInput,
  type DevBootstrapInput,
  type JoinRoomInput,
  type SubmitGuessInput,
  type UpdateLobbySettingsInput,
  getHintRevealDelayMs,
  getRoundTimerDurationMs
} from "@party-game/shared";

import { RoomStore } from "./game/room-store.js";

const roomStore = new RoomStore();
const roomPhaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

const emitRoomState = (io: Server, roomCode: string) => {
  const socketIds = roomStore.getSocketIdsForRoom(roomCode);
  const room = roomStore.getRoomByCode(roomCode);

  if (!room) {
    return;
  }

  for (const socketId of socketIds) {
    io.to(socketId).emit(SERVER_EVENTS.roomState, room);
  }
};

const emitDrawerState = (io: Server, roomCode: string) => {
  const drawerSocketId = roomStore.getDrawerSocketId(roomCode);
  if (!drawerSocketId) {
    return;
  }

  const drawerState = roomStore.getDrawerStateForSocketId(drawerSocketId);
  if (!drawerState) {
    return;
  }

  io.to(drawerSocketId).emit(SERVER_EVENTS.drawerState, drawerState);
};

const emitRoomError = (
  io: Server,
  socketId: string,
  payload: {
    code: string;
    message: string;
  }
) => {
  io.to(socketId).emit(SERVER_EVENTS.roomError, payload);
};

const clearRoomPhaseTimer = (roomCode: string) => {
  const existingTimer = roomPhaseTimers.get(roomCode);
  if (existingTimer) {
    clearTimeout(existingTimer);
    roomPhaseTimers.delete(roomCode);
  }
};

const syncRoomPhaseTimer = (io: Server, roomCode: string) => {
  clearRoomPhaseTimer(roomCode);

  const room = roomStore.getRoomByCode(roomCode);
  const activeGame = room?.activeGame;
  if (!room || room.phase !== "playing" || !activeGame || activeGame.phaseEndsAt === null) {
    return;
  }

  const drawingDurationMs = getRoundTimerDurationMs(room.settings.roundTimerSeconds);
  const hintRevealDelayMs = getHintRevealDelayMs(room.settings.roundTimerSeconds);
  const hintRevealAt =
    activeGame.turnStage === "drawing" &&
    activeGame.revealedLetterIndices.length === 0 &&
    activeGame.phaseEndsAt !== null
      ? activeGame.phaseEndsAt - drawingDurationMs + hintRevealDelayMs
      : null;
  const nextEventAt =
    hintRevealAt !== null ? Math.min(activeGame.phaseEndsAt, hintRevealAt) : activeGame.phaseEndsAt;
  const delayMs = Math.max(0, nextEventAt - Date.now());
  const timer = setTimeout(() => {
    roomPhaseTimers.delete(roomCode);

    const currentRoom = roomStore.getRoomByCode(roomCode);
    const currentGame = currentRoom?.activeGame;
    if (!currentRoom || currentRoom.phase !== "playing" || !currentGame) {
      return;
    }

    if (currentGame.phaseEndsAt === null) {
      return;
    }

    const currentDrawingDurationMs = getRoundTimerDurationMs(currentRoom.settings.roundTimerSeconds);
    const currentHintRevealDelayMs = getHintRevealDelayMs(currentRoom.settings.roundTimerSeconds);
    const currentHintRevealAt =
      currentGame.turnStage === "drawing" &&
      currentGame.revealedLetterIndices.length === 0 &&
      currentGame.phaseEndsAt !== null
        ? currentGame.phaseEndsAt - currentDrawingDurationMs + currentHintRevealDelayMs
        : null;
    const nextRoom =
      currentGame.turnStage === "drawing" &&
      currentHintRevealAt !== null &&
      Date.now() >= currentHintRevealAt &&
      Date.now() < currentGame.phaseEndsAt
        ? roomStore.revealHintLetter(roomCode)
        : currentGame.turnStage === "choosing_word"
          ? roomStore.autoChooseWord(roomCode)
          : currentGame.turnStage === "drawing"
            ? roomStore.finishCurrentTurn(roomCode, "time_up")
            : currentGame.turnStage === "intermission"
              ? roomStore.advanceTurn(roomCode)
              : null;

    if (!nextRoom) {
      return;
    }

    emitRoomState(io, roomCode);
    emitDrawerState(io, roomCode);
    syncRoomPhaseTimer(io, roomCode);
  }, delayMs);

  roomPhaseTimers.set(roomCode, timer);
};

export const registerSocketHandlers = (io: Server) => {
  io.on("connection", (socket) => {
    socket.emit(SERVER_EVENTS.connectionAck, {
      message: "Socket connected"
    });

    socket.on(CLIENT_EVENTS.roomCreate, (input: CreateRoomInput) => {
      const result = roomStore.createRoom(socket.id, input);
      if (!result.ok) {
        emitRoomError(io, socket.id, result.error);
        return;
      }

      socket.emit(SERVER_EVENTS.roomJoined, {
        playerId: result.playerId,
        room: result.room
      });
    });

    socket.on(CLIENT_EVENTS.devBootstrap, (input: DevBootstrapInput) => {
      const result = roomStore.bootstrapDevRoom(socket.id, input);
      if (!result.ok) {
        emitRoomError(io, socket.id, result.error);
        return;
      }

      socket.emit(SERVER_EVENTS.roomJoined, {
        playerId: result.playerId,
        room: result.room
      });
      emitRoomState(io, result.room.roomCode);
      emitDrawerState(io, result.room.roomCode);
      syncRoomPhaseTimer(io, result.room.roomCode);
    });

    socket.on(CLIENT_EVENTS.roomJoin, (input: JoinRoomInput) => {
      const result = roomStore.joinRoom(socket.id, input);
      if (!result.ok) {
        emitRoomError(io, socket.id, result.error);
        return;
      }

      socket.emit(SERVER_EVENTS.roomJoined, {
        playerId: result.playerId,
        room: result.room
      });
      emitRoomState(io, result.room.roomCode);
      syncRoomPhaseTimer(io, result.room.roomCode);
    });

    socket.on(CLIENT_EVENTS.gameStart, () => {
      const result = roomStore.startGame(socket.id);
      if (!result.ok) {
        emitRoomError(io, socket.id, result.error);
        return;
      }

      emitRoomState(io, result.room.roomCode);
      emitDrawerState(io, result.room.roomCode);
      syncRoomPhaseTimer(io, result.room.roomCode);
    });

    socket.on(CLIENT_EVENTS.gameUpdateLobbySettings, (input: UpdateLobbySettingsInput) => {
      const result = roomStore.updateLobbySettings(socket.id, input);
      if (!result.ok) {
        emitRoomError(io, socket.id, result.error);
        return;
      }

      emitRoomState(io, result.room.roomCode);
    });

    socket.on(CLIENT_EVENTS.gameReturnToLobby, () => {
      const result = roomStore.returnRoomToLobby(socket.id);
      if (!result.ok) {
        emitRoomError(io, socket.id, result.error);
        return;
      }

      clearRoomPhaseTimer(result.room.roomCode);
      emitRoomState(io, result.room.roomCode);
    });

    socket.on(CLIENT_EVENTS.turnChooseWord, (input: ChooseWordInput) => {
      const result = roomStore.chooseWord(socket.id, input);
      if (!result.ok) {
        emitRoomError(io, socket.id, result.error);
        return;
      }

      emitRoomState(io, result.room.roomCode);
      emitDrawerState(io, result.room.roomCode);
      syncRoomPhaseTimer(io, result.room.roomCode);
    });

    socket.on(CLIENT_EVENTS.chatGuess, (input: SubmitGuessInput) => {
      const result = roomStore.submitGuess(socket.id, input);
      if (!result.ok) {
        emitRoomError(io, socket.id, result.error);
        return;
      }

      if (result.shouldAdvance) {
        const room = roomStore.finishCurrentTurn(result.room.roomCode, "all_guessed");
        if (!room) {
          return;
        }

        emitRoomState(io, room.roomCode);
        emitDrawerState(io, room.roomCode);
        syncRoomPhaseTimer(io, room.roomCode);
        return;
      }

      emitRoomState(io, result.room.roomCode);
      emitDrawerState(io, result.room.roomCode);
    });

    socket.on(CLIENT_EVENTS.canvasStroke, (input: CanvasStroke) => {
      const result = roomStore.submitStroke(socket.id, input);
      if (!result.ok) {
        emitRoomError(io, socket.id, result.error);
        return;
      }

      const socketIds = roomStore.getSocketIdsForRoom(result.roomCode);
      for (const roomSocketId of socketIds) {
        io.to(roomSocketId).emit(SERVER_EVENTS.canvasStroke, result.stroke);
      }
    });

    socket.on(CLIENT_EVENTS.canvasClear, () => {
      const result = roomStore.clearCanvas(socket.id);
      if (!result.ok) {
        emitRoomError(io, socket.id, result.error);
        return;
      }

      const socketIds = roomStore.getSocketIdsForRoom(result.roomCode);
      for (const roomSocketId of socketIds) {
        io.to(roomSocketId).emit(SERVER_EVENTS.canvasClear);
      }
    });

    socket.on("disconnect", () => {
      const room = roomStore.removePlayerBySocketId(socket.id);
      if (!room) {
        return;
      }

      clearRoomPhaseTimer(room.roomCode);

      emitRoomState(io, room.roomCode);
      emitDrawerState(io, room.roomCode);
      syncRoomPhaseTimer(io, room.roomCode);
    });
  });
};
