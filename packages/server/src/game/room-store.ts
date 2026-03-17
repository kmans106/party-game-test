import { randomUUID } from "node:crypto";

import {
  CHOOSE_WORD_DURATION_MS,
  ChatMessageType,
  DEFAULT_TOTAL_ROUNDS,
  DEFAULT_ROUND_TIMER_SECONDS,
  DEV_ROOM_CODE,
  GamePhase,
  INTERMISSION_DURATION_MS,
  MAX_PLAYER_NAME_LENGTH,
  MIN_PLAYERS_TO_START,
  ROUND_TIMER_OPTIONS,
  ROOM_CODE_LENGTH,
  RoomErrorCode,
  TOTAL_ROUNDS_OPTIONS,
  TurnStage,
  type CanvasStroke,
  type ChooseWordInput,
  type ChatMessage,
  type CreateRoomInput,
  type DevBootstrapInput,
  type DrawerStatePayload,
  type JoinRoomInput,
  type LobbySettings,
  type Player,
  type RoomErrorPayload,
  type RoomState,
  type SubmitGuessInput,
  type UpdateLobbySettingsInput,
  getRoundTimerDurationMs
} from "@party-game/shared";

import { getRandomWordChoices } from "./words.js";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const WORD_CHOICE_COUNT = 3;
const DRAWER_CORRECT_GUESS_BONUS = 50;
const GUESS_MESSAGE_LIMIT = 30;
const GUESSES_SCORE_BY_ORDER = [120, 90, 70, 50];

type RoomRecord = {
  room: RoomState;
  drawerState: DrawerStatePayload | null;
  socketIdsByPlayerId: Map<string, string>;
  playerIdsBySocketId: Map<string, string>;
  playerSessionIdsByPlayerId: Map<string, string>;
  playerIdsBySessionId: Map<string, string>;
};

type RoomMutationResult =
  | {
      ok: true;
      playerId: string;
      room: RoomState;
    }
  | {
      ok: false;
      error: RoomErrorPayload;
    };

export class RoomStore {
  private readonly rooms = new Map<string, RoomRecord>();

  createRoom(socketId: string, input: CreateRoomInput): RoomMutationResult {
    const normalizedName = this.normalizePlayerName(input.playerName);
    if (!normalizedName) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidName,
          message: `Enter a name between 1 and ${MAX_PLAYER_NAME_LENGTH} characters.`
        }
      };
    }

    let roomCode = this.generateRoomCode();
    while (this.rooms.has(roomCode)) {
      roomCode = this.generateRoomCode();
    }

    const player = this.createPlayer(normalizedName);
    const room = this.createRoomRecord(
      roomCode,
      socketId,
      player,
      this.normalizePlayerSessionId(input.playerSessionId)
    );

    return {
      ok: true,
      playerId: player.id,
      room
    };
  }

  bootstrapDevRoom(socketId: string, input: DevBootstrapInput): RoomMutationResult {
    const normalizedName = this.normalizePlayerName(input.playerName);
    if (!normalizedName) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidName,
          message: `Enter a name between 1 and ${MAX_PLAYER_NAME_LENGTH} characters.`
        }
      };
    }

    const existingRoom = this.rooms.get(DEV_ROOM_CODE);
    if (!existingRoom) {
      const player = this.createPlayer(normalizedName);
      const room = this.createRoomRecord(
        DEV_ROOM_CODE,
        socketId,
        player,
        this.normalizePlayerSessionId(input.playerSessionId)
      );
      return {
        ok: true,
        playerId: player.id,
        room
      };
    }

    return this.joinRoom(socketId, {
      roomCode: DEV_ROOM_CODE,
      playerName: normalizedName,
      playerSessionId: input.playerSessionId
    });
  }

  joinRoom(socketId: string, input: JoinRoomInput): RoomMutationResult {
    const roomCode = input.roomCode.trim().toUpperCase();
    if (roomCode.length !== ROOM_CODE_LENGTH) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidRoomCode,
          message: `Room codes must be ${ROOM_CODE_LENGTH} characters.`
        }
      };
    }

    const normalizedName = this.normalizePlayerName(input.playerName);
    if (!normalizedName) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidName,
          message: `Enter a name between 1 and ${MAX_PLAYER_NAME_LENGTH} characters.`
        }
      };
    }

    const roomRecord = this.rooms.get(roomCode);
    if (!roomRecord) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.RoomNotFound,
          message: "That room does not exist."
        }
      };
    }

    const playerSessionId = this.normalizePlayerSessionId(input.playerSessionId);
    const existingPlayerId = roomRecord.playerIdsBySessionId.get(playerSessionId);
    if (existingPlayerId) {
      const existingPlayer = roomRecord.room.players.find((player) => player.id === existingPlayerId);
      if (existingPlayer && !existingPlayer.isConnected) {
        existingPlayer.isConnected = true;
        roomRecord.socketIdsByPlayerId.set(existingPlayer.id, socketId);
        roomRecord.playerIdsBySocketId.set(socketId, existingPlayer.id);

        return {
          ok: true,
          playerId: existingPlayer.id,
          room: roomRecord.room
        };
      }
    }

    if (roomRecord.room.phase !== GamePhase.Lobby) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.GameAlreadyStarted,
          message: "You cannot join a room after the game has started."
        }
      };
    }

    const hasNameConflict = roomRecord.room.players.some(
      (player) => player.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
    );
    if (hasNameConflict) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.DuplicateName,
          message: "That name is already in use in this room."
        }
      };
    }

    const player = this.createPlayer(normalizedName);
    roomRecord.room.players.push(player);
    roomRecord.socketIdsByPlayerId.set(player.id, socketId);
    roomRecord.playerIdsBySocketId.set(socketId, player.id);
    roomRecord.playerSessionIdsByPlayerId.set(player.id, playerSessionId);
    roomRecord.playerIdsBySessionId.set(playerSessionId, player.id);

    return {
      ok: true,
      playerId: player.id,
      room: roomRecord.room
    };
  }

  markPlayerDisconnected(socketId: string):
    | {
        room: RoomState;
        roomCode: string;
        playerId: string;
      }
    | null {
    const roomRecord = this.getRoomRecordBySocketId(socketId);
    if (!roomRecord) {
      return null;
    }

    const playerId = roomRecord.playerIdsBySocketId.get(socketId);
    if (!playerId) {
      return null;
    }

    const player = roomRecord.room.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return null;
    }

    roomRecord.playerIdsBySocketId.delete(socketId);
    roomRecord.socketIdsByPlayerId.delete(playerId);
    player.isConnected = false;

    return {
      room: roomRecord.room,
      roomCode: roomRecord.room.roomCode,
      playerId
    };
  }

  expireDisconnectedPlayer(playerId: string):
    | {
        room: RoomState | null;
        roomCode: string;
      }
    | null {
    const roomRecord = this.getRoomRecordByPlayerId(playerId);
    if (!roomRecord) {
      return null;
    }

    const player = roomRecord.room.players.find((candidate) => candidate.id === playerId);
    if (!player || player.isConnected) {
      return null;
    }

    return {
      room: this.removePlayerFromRoom(roomRecord, playerId),
      roomCode: roomRecord.room.roomCode
    };
  }

  removePlayerBySocketId(socketId: string): RoomState | null {
    const roomRecord = this.getRoomRecordBySocketId(socketId);
    if (!roomRecord) {
      return null;
    }

    const playerId = roomRecord.playerIdsBySocketId.get(socketId);
    if (!playerId) {
      return null;
    }

    return this.removePlayerFromRoom(roomRecord, playerId);
  }

  startGame(socketId: string):
    | {
        ok: true;
        room: RoomState;
      }
    | {
        ok: false;
        error: RoomErrorPayload;
      } {
    const roomRecord = this.getRoomRecordBySocketId(socketId);
    if (!roomRecord) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.RoomNotFound,
          message: "You are not currently in a room."
        }
      };
    }

    const requestingPlayerId = roomRecord.playerIdsBySocketId.get(socketId);
    if (!requestingPlayerId || roomRecord.room.hostPlayerId !== requestingPlayerId) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.NotHost,
          message: "Only the host can start the game."
        }
      };
    }

    if (roomRecord.room.phase !== GamePhase.Lobby) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.GameAlreadyStarted,
          message: "The game has already started."
        }
      };
    }

    const connectedPlayers = roomRecord.room.players.filter((player) => player.isConnected);
    if (connectedPlayers.length < MIN_PLAYERS_TO_START) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.NotEnoughPlayers,
          message: `At least ${MIN_PLAYERS_TO_START} players are required to start.`
        }
      };
    }

    roomRecord.room.phase = GamePhase.Playing;
    roomRecord.room.activeGame = this.createInitialActiveGame(
      connectedPlayers[0]!.id,
      roomRecord.room.settings
    );
    roomRecord.drawerState = this.createDrawerState();
    roomRecord.room.chatMessages = [
      this.createSystemMessage(
        `${connectedPlayers[0]!.name} is choosing a word for round 1.`
      )
    ];

    return {
      ok: true,
      room: roomRecord.room
    };
  }

  returnRoomToLobby(socketId: string):
    | {
        ok: true;
        room: RoomState;
      }
    | {
        ok: false;
        error: RoomErrorPayload;
      } {
    const roomRecord = this.getRoomRecordBySocketId(socketId);
    if (!roomRecord) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.RoomNotFound,
          message: "You are not currently in a room."
        }
      };
    }

    const requestingPlayerId = roomRecord.playerIdsBySocketId.get(socketId);
    if (!requestingPlayerId || roomRecord.room.hostPlayerId !== requestingPlayerId) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.NotHost,
          message: "Only the host can return the room to the lobby."
        }
      };
    }

    if (roomRecord.room.phase !== GamePhase.Finished) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidGameState,
          message: "The room can only return to the lobby after the game ends."
        }
      };
    }

    roomRecord.room.phase = GamePhase.Lobby;
    roomRecord.room.activeGame = null;
    roomRecord.room.chatMessages = [];
    roomRecord.drawerState = null;
    roomRecord.room.players = roomRecord.room.players.map((player) => ({
      ...player,
      score: 0
    }));

    return {
      ok: true,
      room: roomRecord.room
    };
  }

  updateLobbySettings(socketId: string, input: UpdateLobbySettingsInput):
    | {
        ok: true;
        room: RoomState;
      }
    | {
        ok: false;
        error: RoomErrorPayload;
      } {
    const roomRecord = this.getRoomRecordBySocketId(socketId);
    if (!roomRecord) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.RoomNotFound,
          message: "You are not currently in a room."
        }
      };
    }

    const requestingPlayerId = roomRecord.playerIdsBySocketId.get(socketId);
    if (!requestingPlayerId || roomRecord.room.hostPlayerId !== requestingPlayerId) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.NotHost,
          message: "Only the host can update lobby settings."
        }
      };
    }

    if (roomRecord.room.phase !== GamePhase.Lobby) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidGameState,
          message: "Lobby settings can only be changed before the game starts."
        }
      };
    }

    if (
      !TOTAL_ROUNDS_OPTIONS.includes(input.totalRounds as (typeof TOTAL_ROUNDS_OPTIONS)[number]) ||
      !ROUND_TIMER_OPTIONS.includes(
        input.roundTimerSeconds as (typeof ROUND_TIMER_OPTIONS)[number]
      )
    ) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidLobbySettings,
          message: "Pick one of the available round and timer options."
        }
      };
    }

    roomRecord.room.settings = {
      totalRounds: input.totalRounds,
      roundTimerSeconds: input.roundTimerSeconds
    };

    return {
      ok: true,
      room: roomRecord.room
    };
  }

  chooseWord(socketId: string, input: ChooseWordInput):
    | {
        ok: true;
        room: RoomState;
        drawerState: DrawerStatePayload;
      }
    | {
        ok: false;
        error: RoomErrorPayload;
      } {
    const roomRecord = this.getRoomRecordBySocketId(socketId);
    if (!roomRecord || !roomRecord.room.activeGame || !roomRecord.drawerState) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.RoomNotFound,
          message: "There is no active turn to choose a word for."
        }
      };
    }

    const requestingPlayerId = roomRecord.playerIdsBySocketId.get(socketId);
    if (!requestingPlayerId || requestingPlayerId !== roomRecord.room.activeGame.currentDrawerPlayerId) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.NotCurrentDrawer,
          message: "Only the current drawer can choose the word."
        }
      };
    }

    if (roomRecord.room.activeGame.turnStage !== TurnStage.ChoosingWord) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidWordChoice,
          message: "The word has already been chosen for this turn."
        }
      };
    }

    const chosenWord = input.word.trim().toLowerCase();
    const isValidChoice = roomRecord.drawerState.wordChoices.includes(chosenWord);
    if (!isValidChoice) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidWordChoice,
          message: "Pick one of the words offered to the drawer."
        }
      };
    }

    roomRecord.drawerState = {
      selectedWord: chosenWord,
      wordChoices: roomRecord.drawerState.wordChoices
    };
    roomRecord.room.activeGame.turnStage = TurnStage.Drawing;
    roomRecord.room.activeGame.revealedLetterIndices = [];
    roomRecord.room.activeGame.wordMask = this.createWordMask(chosenWord, []);
    roomRecord.room.activeGame.revealedWord = null;
    roomRecord.room.activeGame.phaseEndsAt =
      Date.now() + getRoundTimerDurationMs(roomRecord.room.settings.roundTimerSeconds);
    roomRecord.room.chatMessages = [
      this.createSystemMessage(`${this.getCurrentDrawerName(roomRecord.room)} started drawing.`)
    ];

    return {
      ok: true,
      room: roomRecord.room,
      drawerState: roomRecord.drawerState
    };
  }

  submitGuess(socketId: string, input: SubmitGuessInput):
    | {
        ok: true;
        room: RoomState;
        shouldAdvance: boolean;
      }
    | {
        ok: false;
        error: RoomErrorPayload;
      } {
    const roomRecord = this.getRoomRecordBySocketId(socketId);
    const playerId = roomRecord?.playerIdsBySocketId.get(socketId);
    if (!roomRecord || !playerId || !roomRecord.room.activeGame) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.RoomNotFound,
          message: "There is no active round to guess in."
        }
      };
    }

    const { room } = roomRecord;
    const activeGame = room.activeGame;
    if (!activeGame) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.RoomNotFound,
          message: "There is no active round to guess in."
        }
      };
    }
    if (activeGame.turnStage !== TurnStage.Drawing) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.NotGuessingPhase,
          message: "Guesses are only allowed after the word is chosen."
        }
      };
    }

    if (!roomRecord.drawerState?.selectedWord) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.NotGuessingPhase,
          message: "Guesses are only allowed after the word is chosen."
        }
      };
    }

    if (activeGame.currentDrawerPlayerId === playerId) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.DrawerCannotGuess,
          message: "The drawer cannot submit guesses."
        }
      };
    }

    const normalizedGuess = this.normalizeGuess(input.guess);
    if (!normalizedGuess) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidGuess,
          message: "Enter a guess before submitting."
        }
      };
    }

    if (activeGame.guessedPlayerIds.includes(playerId)) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.AlreadyGuessed,
          message: "You already guessed the word this turn."
        }
      };
    }

    const guessingPlayer = room.players.find((player) => player.id === playerId);
    if (!guessingPlayer) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.RoomNotFound,
          message: "Guessing player was not found in the room."
        }
      };
    }

    const isCorrect = normalizedGuess === this.normalizeGuess(roomRecord.drawerState.selectedWord);
    if (!isCorrect) {
      this.pushChatMessage(room, {
        id: randomUUID(),
        type: ChatMessageType.Guess,
        playerId,
        playerName: guessingPlayer.name,
        text: input.guess.trim()
      });

      return {
        ok: true,
        room,
        shouldAdvance: false
      };
    }

    const guessOrder = activeGame.guessedPlayerIds.length;
    const guesserPoints = GUESSES_SCORE_BY_ORDER[guessOrder] ?? 40;
    guessingPlayer.score += guesserPoints;

    const drawerPlayer = room.players.find((player) => player.id === activeGame.currentDrawerPlayerId);
    if (drawerPlayer) {
      drawerPlayer.score += DRAWER_CORRECT_GUESS_BONUS;
    }

    activeGame.guessedPlayerIds.push(playerId);
    this.pushChatMessage(room, {
      id: randomUUID(),
      type: ChatMessageType.Correct,
      playerId,
      playerName: guessingPlayer.name,
      text: `${guessingPlayer.name} guessed the word.`
    });

    const shouldAdvance = this.haveAllGuessersFinished(room);
    return {
      ok: true,
      room,
      shouldAdvance
    };
  }

  advanceTurn(roomCode: string): RoomState | null {
    const roomRecord = this.rooms.get(roomCode);
    if (!roomRecord || !roomRecord.room.activeGame) {
      return null;
    }

    const nextTurn = this.getNextConnectedTurn(roomRecord.room);
    if (!nextTurn) {
      roomRecord.room.phase = GamePhase.Finished;
      roomRecord.room.activeGame = null;
      roomRecord.drawerState = null;
      roomRecord.room.chatMessages = [this.createSystemMessage("Game over.")];
      return roomRecord.room;
    }

    roomRecord.room.activeGame.roundNumber = nextTurn.roundNumber;
    roomRecord.room.activeGame.turnIndex = nextTurn.turnIndex;
    roomRecord.room.activeGame.currentDrawerPlayerId = nextTurn.playerId;

    roomRecord.room.activeGame.turnStage = TurnStage.ChoosingWord;
    roomRecord.room.activeGame.wordMask = null;
    roomRecord.room.activeGame.revealedWord = null;
    roomRecord.room.activeGame.revealedLetterIndices = [];
    roomRecord.room.activeGame.guessedPlayerIds = [];
    roomRecord.room.activeGame.phaseEndsAt = Date.now() + CHOOSE_WORD_DURATION_MS;
    roomRecord.drawerState = this.createDrawerState();
    roomRecord.room.chatMessages = [
      this.createSystemMessage(
        `${this.getCurrentDrawerName(roomRecord.room)} is choosing a word for round ${roomRecord.room.activeGame.roundNumber}.`
      )
    ];

    return roomRecord.room;
  }

  autoChooseWord(roomCode: string): RoomState | null {
    const roomRecord = this.rooms.get(roomCode);
    if (!roomRecord?.room.activeGame || !roomRecord.drawerState) {
      return null;
    }

    if (roomRecord.room.activeGame.turnStage !== TurnStage.ChoosingWord) {
      return roomRecord.room;
    }

    const chosenWord = roomRecord.drawerState.wordChoices[0];
    if (!chosenWord) {
      return roomRecord.room;
    }

    roomRecord.drawerState = {
      selectedWord: chosenWord,
      wordChoices: roomRecord.drawerState.wordChoices
    };
    roomRecord.room.activeGame.turnStage = TurnStage.Drawing;
    roomRecord.room.activeGame.revealedLetterIndices = [];
    roomRecord.room.activeGame.wordMask = this.createWordMask(chosenWord, []);
    roomRecord.room.activeGame.revealedWord = null;
    roomRecord.room.activeGame.phaseEndsAt =
      Date.now() + getRoundTimerDurationMs(roomRecord.room.settings.roundTimerSeconds);
    roomRecord.room.chatMessages = [
      this.createSystemMessage(`${this.getCurrentDrawerName(roomRecord.room)} started drawing.`)
    ];

    return roomRecord.room;
  }

  finishCurrentTurn(roomCode: string, reason: "all_guessed" | "time_up"): RoomState | null {
    const roomRecord = this.rooms.get(roomCode);
    if (!roomRecord?.room.activeGame || !roomRecord.drawerState?.selectedWord) {
      return null;
    }

    if (roomRecord.room.activeGame.turnStage !== TurnStage.Drawing) {
      return roomRecord.room;
    }

    roomRecord.room.activeGame.turnStage = TurnStage.Intermission;
    roomRecord.room.activeGame.phaseEndsAt = Date.now() + INTERMISSION_DURATION_MS;
    roomRecord.room.activeGame.revealedWord = roomRecord.drawerState.selectedWord;
    roomRecord.room.chatMessages = [
      ...roomRecord.room.chatMessages,
      this.createSystemMessage(
        reason === "all_guessed"
          ? "Everyone guessed correctly. Next turn starting soon..."
          : `Time is up. The word was "${roomRecord.drawerState.selectedWord}".`
      )
    ].slice(-GUESS_MESSAGE_LIMIT);

    return roomRecord.room;
  }

  revealHintLetter(roomCode: string): RoomState | null {
    const roomRecord = this.rooms.get(roomCode);
    const selectedWord = roomRecord?.drawerState?.selectedWord;
    const activeGame = roomRecord?.room.activeGame;
    if (!roomRecord || !selectedWord || !activeGame || activeGame.turnStage !== TurnStage.Drawing) {
      return null;
    }

    if (activeGame.revealedLetterIndices.length > 0) {
      return roomRecord.room;
    }

    const revealableIndices = selectedWord
      .split("")
      .map((character, index) => ({ character, index }))
      .filter(({ character }) => character !== " ");
    if (revealableIndices.length === 0) {
      return roomRecord.room;
    }

    const randomIndex =
      revealableIndices[Math.floor(Math.random() * revealableIndices.length)]?.index ?? null;
    if (randomIndex === null) {
      return roomRecord.room;
    }

    activeGame.revealedLetterIndices = [randomIndex];
    activeGame.wordMask = this.createWordMask(selectedWord, activeGame.revealedLetterIndices);
    this.pushChatMessage(roomRecord.room, this.createSystemMessage("A letter has been revealed."));

    return roomRecord.room;
  }

  submitStroke(socketId: string, stroke: CanvasStroke):
    | {
        ok: true;
        roomCode: string;
        stroke: CanvasStroke;
      }
    | {
        ok: false;
        error: RoomErrorPayload;
      } {
    const roomRecord = this.getRoomRecordBySocketId(socketId);
    const playerId = roomRecord?.playerIdsBySocketId.get(socketId);
    if (!roomRecord || !playerId || !roomRecord.room.activeGame) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.RoomNotFound,
          message: "There is no active room for this stroke."
        }
      };
    }

    if (roomRecord.room.activeGame.turnStage !== TurnStage.Drawing) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidStroke,
          message: "Drawing is not active yet."
        }
      };
    }

    if (roomRecord.room.activeGame.currentDrawerPlayerId !== playerId) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.NotCurrentDrawer,
          message: "Only the current drawer can draw."
        }
      };
    }

    const sanitizedStroke = this.sanitizeStroke(stroke);
    if (!sanitizedStroke) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidStroke,
          message: "Stroke payload was invalid."
        }
      };
    }

    return {
      ok: true,
      roomCode: roomRecord.room.roomCode,
      stroke: sanitizedStroke
    };
  }

  clearCanvas(socketId: string):
    | {
        ok: true;
        roomCode: string;
      }
    | {
        ok: false;
        error: RoomErrorPayload;
      } {
    const roomRecord = this.getRoomRecordBySocketId(socketId);
    const playerId = roomRecord?.playerIdsBySocketId.get(socketId);
    if (!roomRecord || !playerId || !roomRecord.room.activeGame) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.RoomNotFound,
          message: "There is no active room to clear."
        }
      };
    }

    if (roomRecord.room.activeGame.turnStage !== TurnStage.Drawing) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.InvalidStroke,
          message: "The canvas can only be cleared while drawing is active."
        }
      };
    }

    if (roomRecord.room.activeGame.currentDrawerPlayerId !== playerId) {
      return {
        ok: false,
        error: {
          code: RoomErrorCode.NotCurrentDrawer,
          message: "Only the current drawer can clear the canvas."
        }
      };
    }

    return {
      ok: true,
      roomCode: roomRecord.room.roomCode
    };
  }

  getRoomBySocketId(socketId: string): RoomState | null {
    return this.getRoomRecordBySocketId(socketId)?.room ?? null;
  }

  getRoomByCode(roomCode: string): RoomState | null {
    return this.rooms.get(roomCode)?.room ?? null;
  }

  getDrawerStateForSocketId(socketId: string): DrawerStatePayload | null {
    const roomRecord = this.getRoomRecordBySocketId(socketId);
    if (!roomRecord?.room.activeGame || roomRecord.room.activeGame.turnStage === TurnStage.Intermission) {
      return null;
    }

    const playerId = roomRecord.playerIdsBySocketId.get(socketId);
    if (!playerId || roomRecord.room.activeGame.currentDrawerPlayerId !== playerId) {
      return null;
    }

    return roomRecord.drawerState ?? null;
  }

  getSocketIdsForRoom(roomCode: string): string[] {
    return [...(this.rooms.get(roomCode)?.playerIdsBySocketId.keys() ?? [])];
  }

  getDrawerSocketId(roomCode: string): string | null {
    const roomRecord = this.rooms.get(roomCode);
    const drawerId = roomRecord?.room.activeGame?.currentDrawerPlayerId;
    if (!roomRecord || !drawerId) {
      return null;
    }

    return roomRecord.socketIdsByPlayerId.get(drawerId) ?? null;
  }

  private createPlayer(name: string): Player {
    return {
      id: randomUUID(),
      name,
      score: 0,
      isConnected: true
    };
  }

  private createRoomRecord(
    roomCode: string,
    socketId: string,
    player: Player,
    playerSessionId: string
  ) {
    const room: RoomState = {
      roomCode,
      phase: GamePhase.Lobby,
      players: [player],
      hostPlayerId: player.id,
      settings: this.createDefaultLobbySettings(),
      activeGame: null,
      chatMessages: []
    };

    this.rooms.set(roomCode, {
      drawerState: null,
      room,
      playerIdsBySessionId: new Map([[playerSessionId, player.id]]),
      socketIdsByPlayerId: new Map([[player.id, socketId]]),
      playerIdsBySocketId: new Map([[socketId, player.id]]),
      playerSessionIdsByPlayerId: new Map([[player.id, playerSessionId]])
    });

    return room;
  }

  private generateRoomCode() {
    let roomCode = "";

    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      const randomIndex = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
      roomCode += ROOM_CODE_ALPHABET[randomIndex];
    }

    return roomCode;
  }

  private getRoomRecordBySocketId(socketId: string): RoomRecord | undefined {
    for (const roomRecord of this.rooms.values()) {
      if (roomRecord.playerIdsBySocketId.has(socketId)) {
        return roomRecord;
      }
    }

    return undefined;
  }

  private getRoomRecordByPlayerId(playerId: string): RoomRecord | undefined {
    for (const roomRecord of this.rooms.values()) {
      if (roomRecord.room.players.some((player) => player.id === playerId)) {
        return roomRecord;
      }
    }

    return undefined;
  }

  private normalizePlayerName(playerName: string) {
    const trimmedName = playerName.trim();
    if (trimmedName.length === 0 || trimmedName.length > MAX_PLAYER_NAME_LENGTH) {
      return null;
    }

    return trimmedName;
  }

  private normalizePlayerSessionId(playerSessionId: string) {
    const normalizedPlayerSessionId = playerSessionId.trim().slice(0, 128);
    return normalizedPlayerSessionId.length > 0 ? normalizedPlayerSessionId : randomUUID();
  }

  private removePlayerFromRoom(roomRecord: RoomRecord, playerId: string): RoomState | null {
    const removedPlayer = roomRecord.room.players.find((player) => player.id === playerId);
    if (!removedPlayer) {
      return null;
    }

    const nextHostName =
      roomRecord.room.hostPlayerId === playerId
        ? roomRecord.room.players.find((player) => player.id !== playerId)?.name ?? null
        : null;
    const socketId = roomRecord.socketIdsByPlayerId.get(playerId);
    const playerSessionId = roomRecord.playerSessionIdsByPlayerId.get(playerId);

    if (socketId) {
      roomRecord.playerIdsBySocketId.delete(socketId);
    }
    roomRecord.socketIdsByPlayerId.delete(playerId);
    roomRecord.playerSessionIdsByPlayerId.delete(playerId);
    if (playerSessionId) {
      roomRecord.playerIdsBySessionId.delete(playerSessionId);
    }

    const removedPlayerIndex = roomRecord.room.players.findIndex((player) => player.id === playerId);
    roomRecord.room.players = roomRecord.room.players.filter((player) => player.id !== playerId);

    if (roomRecord.room.players.length === 0) {
      this.rooms.delete(roomRecord.room.roomCode);
      return null;
    }

    if (roomRecord.room.hostPlayerId === playerId) {
      roomRecord.room.hostPlayerId = roomRecord.room.players[0]?.id ?? null;
    }

    if (roomRecord.room.phase === GamePhase.Playing) {
      this.reconcileActiveGameAfterPlayerRemoval(roomRecord, removedPlayerIndex, removedPlayer);
    } else {
      roomRecord.drawerState = null;
    }

    if (
      nextHostName &&
      roomRecord.room.phase === GamePhase.Lobby &&
      roomRecord.room.players.length >= 1
    ) {
      roomRecord.room.chatMessages = [
        this.createSystemMessage(`${removedPlayer.name} left. ${nextHostName} is now the host.`)
      ];
    }

    return roomRecord.room;
  }

  private reconcileActiveGameAfterPlayerRemoval(
    roomRecord: RoomRecord,
    removedPlayerIndex: number,
    removedPlayer: Player
  ) {
    const { room } = roomRecord;
    if (room.players.length < MIN_PLAYERS_TO_START) {
      room.phase = GamePhase.Lobby;
      room.activeGame = null;
      room.chatMessages = [
        this.createSystemMessage(
          `${removedPlayer.name} left the room. Not enough players remain, so the game returned to the lobby.`
        )
      ];
      roomRecord.drawerState = null;
      return;
    }

    if (!room.activeGame) {
      roomRecord.drawerState = null;
      return;
    }

    room.activeGame.guessedPlayerIds = room.activeGame.guessedPlayerIds.filter(
      (guessedPlayerId) => guessedPlayerId !== removedPlayer.id
    );

    const wasCurrentDrawer = room.activeGame.currentDrawerPlayerId === removedPlayer.id;
    if (!wasCurrentDrawer) {
      if (removedPlayerIndex >= 0 && removedPlayerIndex < room.activeGame.turnIndex) {
        room.activeGame.turnIndex -= 1;
      }

      this.pushChatMessage(room, this.createSystemMessage(`${removedPlayer.name} left the room.`));

      if (
        room.activeGame.turnStage === TurnStage.Drawing &&
        roomRecord.drawerState?.selectedWord &&
        this.haveAllGuessersFinished(room)
      ) {
        this.finishCurrentTurn(room.roomCode, "all_guessed");
      }

      return;
    }

    if (room.activeGame.turnStage === TurnStage.ChoosingWord) {
      this.moveToNextDrawerAfterRemoval(
        roomRecord,
        removedPlayerIndex,
        `${removedPlayer.name} left before choosing a word. ${this.getUpcomingDrawerNameAfterRemoval(
          room,
          removedPlayerIndex
        )} is choosing now.`
      );
      return;
    }

    this.setIntermissionAfterDrawerDisconnect(roomRecord, removedPlayerIndex, removedPlayer.name);
  }

  private moveToNextDrawerAfterRemoval(
    roomRecord: RoomRecord,
    removedPlayerIndex: number,
    message: string
  ) {
    const { room } = roomRecord;
    if (!room.activeGame) {
      return;
    }

    const nextTurnIndex = Math.max(0, removedPlayerIndex);
    if (nextTurnIndex >= room.players.length) {
      if (room.activeGame.roundNumber >= room.activeGame.totalRounds) {
        room.phase = GamePhase.Finished;
        room.activeGame = null;
        roomRecord.drawerState = null;
        room.chatMessages = [this.createSystemMessage("Game over.")];
        return;
      }

      room.activeGame.roundNumber += 1;
      room.activeGame.turnIndex = 0;
      room.activeGame.currentDrawerPlayerId = room.players[0]!.id;
    } else {
      room.activeGame.turnIndex = nextTurnIndex;
      room.activeGame.currentDrawerPlayerId = room.players[nextTurnIndex]!.id;
    }

    room.activeGame.turnStage = TurnStage.ChoosingWord;
    room.activeGame.wordMask = null;
    room.activeGame.revealedWord = null;
    room.activeGame.revealedLetterIndices = [];
    room.activeGame.guessedPlayerIds = [];
    room.activeGame.phaseEndsAt = Date.now() + CHOOSE_WORD_DURATION_MS;
    roomRecord.drawerState = this.createDrawerState();
    room.chatMessages = [this.createSystemMessage(message)];
  }

  private setIntermissionAfterDrawerDisconnect(
    roomRecord: RoomRecord,
    removedPlayerIndex: number,
    removedPlayerName: string
  ) {
    const { room } = roomRecord;
    if (!room.activeGame) {
      return;
    }

    const selectedWord = roomRecord.drawerState?.selectedWord ?? room.activeGame.revealedWord;
    const upcomingDrawerIndex = removedPlayerIndex >= room.players.length ? 0 : removedPlayerIndex;
    const previousTurnIndex = Math.min(room.players.length - 1, removedPlayerIndex - 1);

    room.activeGame.turnIndex = previousTurnIndex;
    room.activeGame.currentDrawerPlayerId = room.players[upcomingDrawerIndex]!.id;
    room.activeGame.turnStage = TurnStage.Intermission;
    room.activeGame.revealedWord = selectedWord ?? "Unknown";
    room.activeGame.revealedLetterIndices = [];
    room.activeGame.wordMask = this.createWordMask(room.activeGame.revealedWord, []);
    room.activeGame.guessedPlayerIds = [];
    room.activeGame.phaseEndsAt = Date.now() + INTERMISSION_DURATION_MS;
    roomRecord.drawerState = null;
    room.chatMessages = [
      ...room.chatMessages,
      this.createSystemMessage(
        `${removedPlayerName} left during the turn. The word was "${room.activeGame.revealedWord}".`
      )
    ].slice(-GUESS_MESSAGE_LIMIT);
  }

  private createDrawerState(): DrawerStatePayload {
    return {
      selectedWord: null,
      wordChoices: getRandomWordChoices(WORD_CHOICE_COUNT)
    };
  }

  private createDefaultLobbySettings(): LobbySettings {
    return {
      totalRounds: DEFAULT_TOTAL_ROUNDS,
      roundTimerSeconds: DEFAULT_ROUND_TIMER_SECONDS
    };
  }

  private createInitialActiveGame(currentDrawerPlayerId: string, settings: LobbySettings) {
    return {
      roundNumber: 1,
      totalRounds: settings.totalRounds,
      turnIndex: 0,
      currentDrawerPlayerId,
      turnStage: TurnStage.ChoosingWord,
      wordMask: null,
      revealedWord: null,
      revealedLetterIndices: [],
      guessedPlayerIds: [],
      phaseEndsAt: Date.now() + CHOOSE_WORD_DURATION_MS
    };
  }

  private createWordMask(word: string, revealedLetterIndices: number[]) {
    return word
      .split("")
      .map((character, index) => {
        if (character === " ") {
          return "/";
        }

        return revealedLetterIndices.includes(index) ? character.toUpperCase() : "_";
      })
      .join(" ");
  }

  private sanitizeStroke(stroke: CanvasStroke): CanvasStroke | null {
    const points = [stroke.fromX, stroke.fromY, stroke.toX, stroke.toY];
    const hasInvalidPoint = points.some((value) => !Number.isFinite(value) || value < 0 || value > 1);
    if (hasInvalidPoint) {
      return null;
    }

    if (!Number.isFinite(stroke.width) || stroke.width <= 0 || stroke.width > 24) {
      return null;
    }

    const color = stroke.color.trim().slice(0, 32);
    if (color.length === 0) {
      return null;
    }

    return {
      fromX: stroke.fromX,
      fromY: stroke.fromY,
      toX: stroke.toX,
      toY: stroke.toY,
      color,
      width: stroke.width
    };
  }

  private createSystemMessage(text: string): ChatMessage {
    return {
      id: randomUUID(),
      type: ChatMessageType.System,
      playerId: null,
      playerName: null,
      text
    };
  }

  private pushChatMessage(room: RoomState, message: ChatMessage) {
    room.chatMessages = [...room.chatMessages, message].slice(-GUESS_MESSAGE_LIMIT);
  }

  private haveAllGuessersFinished(room: RoomState) {
    if (!room.activeGame) {
      return false;
    }

    const eligibleGuessers = room.players.filter(
      (player) => player.isConnected && player.id !== room.activeGame?.currentDrawerPlayerId
    );
    return eligibleGuessers.every((player) => room.activeGame?.guessedPlayerIds.includes(player.id));
  }

  private getNextConnectedTurn(room: RoomState) {
    const activeGame = room.activeGame;
    if (!activeGame || room.players.length === 0) {
      return null;
    }

    const playerCount = room.players.length;
    const currentAbsoluteTurnIndex = (activeGame.roundNumber - 1) * playerCount + activeGame.turnIndex;
    const totalTurnCount = activeGame.totalRounds * playerCount;

    for (let offset = 1; offset < totalTurnCount - currentAbsoluteTurnIndex; offset += 1) {
      const nextAbsoluteTurnIndex = currentAbsoluteTurnIndex + offset;
      const nextTurnIndex = nextAbsoluteTurnIndex % playerCount;
      const nextPlayer = room.players[nextTurnIndex];
      if (!nextPlayer?.isConnected) {
        continue;
      }

      return {
        playerId: nextPlayer.id,
        roundNumber: Math.floor(nextAbsoluteTurnIndex / playerCount) + 1,
        turnIndex: nextTurnIndex
      };
    }

    return null;
  }

  private normalizeGuess(guess: string) {
    const normalizedGuess = guess.trim().toLowerCase().replace(/\s+/g, " ");
    return normalizedGuess.length > 0 ? normalizedGuess : null;
  }

  private getCurrentDrawerName(room: RoomState) {
    return (
      room.players.find((player) => player.id === room.activeGame?.currentDrawerPlayerId)?.name ??
      "Unknown player"
    );
  }

  private getUpcomingDrawerNameAfterRemoval(room: RoomState, removedPlayerIndex: number) {
    const nextIndex = removedPlayerIndex >= room.players.length ? 0 : Math.max(0, removedPlayerIndex);
    return room.players[nextIndex]?.name ?? "The next player";
  }
}
