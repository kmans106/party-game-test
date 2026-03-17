import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEV_ROOM_CODE,
  CLIENT_EVENTS,
  RoomErrorCode,
  SERVER_EVENTS,
  TurnStage,
  type CanvasStroke,
  type ChooseWordInput,
  type CreateRoomInput,
  type DevBootstrapInput,
  type DrawerStatePayload,
  type JoinRoomInput,
  type RoomErrorPayload,
  type RoomState,
  type SubmitGuessInput,
  type UpdateLobbySettingsInput
} from "@party-game/shared";
import type { Socket } from "socket.io-client";

import { createGameSocket } from "../api/socket.js";

type UseRoomConnectionState = {
  strokes: CanvasStroke[];
  drawerState: DrawerStatePayload | null;
  error: string | null;
  isConnected: boolean;
  isSubmitting: boolean;
  playerId: string | null;
  room: RoomState | null;
};

type UseRoomConnectionResult = UseRoomConnectionState & {
  bootstrapDevRoom: (input: DevBootstrapInput) => void;
  chooseWord: (input: ChooseWordInput) => void;
  clearCanvas: () => void;
  createRoom: (input: CreateRoomInput) => void;
  joinRoom: (input: JoinRoomInput) => void;
  returnToLobby: () => void;
  sendStroke: (input: CanvasStroke) => void;
  submitGuess: (input: SubmitGuessInput) => void;
  startGame: () => void;
  updateLobbySettings: (input: UpdateLobbySettingsInput) => void;
};

export const useRoomConnection = (): UseRoomConnectionResult => {
  const socket = useMemo<Socket>(() => createGameSocket(), []);
  const reconnectStateRef = useRef<{
    playerName: string;
    playerSessionId: string;
    roomCode: string | null;
  } | null>(null);
  const [strokes, setStrokes] = useState<CanvasStroke[]>([]);
  const [drawerState, setDrawerState] = useState<DrawerStatePayload | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);

      const reconnectState = reconnectStateRef.current;
      if (!reconnectState?.roomCode) {
        return;
      }

      setIsSubmitting(true);
      socket.emit(CLIENT_EVENTS.roomJoin, {
        playerName: reconnectState.playerName,
        playerSessionId: reconnectState.playerSessionId,
        roomCode: reconnectState.roomCode
      });
    };

    const handleDisconnect = () => {
      setDrawerState(null);
      setStrokes([]);
      setIsConnected(false);
      setIsSubmitting(false);
    };

    const handleRoomJoined = (payload: { playerId: string; room: RoomState }) => {
      if (reconnectStateRef.current) {
        reconnectStateRef.current = {
          ...reconnectStateRef.current,
          roomCode: payload.room.roomCode
        };
      }
      setPlayerId(payload.playerId);
      setRoom(payload.room);
      setError(null);
      setIsSubmitting(false);
    };

    const handleRoomState = (nextRoom: RoomState) => {
      if (reconnectStateRef.current) {
        reconnectStateRef.current = {
          ...reconnectStateRef.current,
          roomCode: nextRoom.roomCode
        };
      }
      setRoom(nextRoom);
      setError(null);
      setIsSubmitting(false);
    };

    const handleDrawerState = (payload: DrawerStatePayload) => {
      setDrawerState(payload);
      setError(null);
      setIsSubmitting(false);
    };

    const handleCanvasStroke = (payload: CanvasStroke) => {
      setStrokes((currentStrokes) => [...currentStrokes, payload]);
    };

    const handleCanvasClear = () => {
      setStrokes([]);
    };

    const handleRoomError = (payload: RoomErrorPayload) => {
      if (payload.code === RoomErrorCode.RoomNotFound) {
        reconnectStateRef.current = null;
        setPlayerId(null);
        setRoom(null);
      }
      setError(payload.message);
      setIsSubmitting(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on(SERVER_EVENTS.roomJoined, handleRoomJoined);
    socket.on(SERVER_EVENTS.roomState, handleRoomState);
    socket.on(SERVER_EVENTS.drawerState, handleDrawerState);
    socket.on(SERVER_EVENTS.canvasStroke, handleCanvasStroke);
    socket.on(SERVER_EVENTS.canvasClear, handleCanvasClear);
    socket.on(SERVER_EVENTS.roomError, handleRoomError);

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off(SERVER_EVENTS.roomJoined, handleRoomJoined);
      socket.off(SERVER_EVENTS.roomState, handleRoomState);
      socket.off(SERVER_EVENTS.drawerState, handleDrawerState);
      socket.off(SERVER_EVENTS.canvasStroke, handleCanvasStroke);
      socket.off(SERVER_EVENTS.canvasClear, handleCanvasClear);
      socket.off(SERVER_EVENTS.roomError, handleRoomError);
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    if (!room || !playerId) {
      setDrawerState(null);
      return;
    }

    const isCurrentDrawer = room.activeGame?.currentDrawerPlayerId === playerId;
    if (!isCurrentDrawer) {
      setDrawerState(null);
    }
  }, [playerId, room]);

  useEffect(() => {
    if (!room?.activeGame) {
      setStrokes([]);
      return;
    }

    if (room.activeGame.turnStage === TurnStage.ChoosingWord) {
      setStrokes([]);
    }
  }, [room?.activeGame?.currentDrawerPlayerId, room?.activeGame?.roundNumber, room?.activeGame?.turnStage]);

  return {
    strokes,
    drawerState,
    error,
    isConnected,
    isSubmitting,
    playerId,
    room,
    bootstrapDevRoom: (input) => {
      setError(null);
      setIsSubmitting(true);
      reconnectStateRef.current = {
        playerName: input.playerName,
        playerSessionId: input.playerSessionId,
        roomCode: DEV_ROOM_CODE
      };
      socket.emit(CLIENT_EVENTS.devBootstrap, input);
    },
    chooseWord: (input) => {
      setError(null);
      setIsSubmitting(true);
      socket.emit(CLIENT_EVENTS.turnChooseWord, input);
    },
    clearCanvas: () => {
      setError(null);
      socket.emit(CLIENT_EVENTS.canvasClear);
    },
    createRoom: (input) => {
      setError(null);
      setIsSubmitting(true);
      reconnectStateRef.current = {
        playerName: input.playerName,
        playerSessionId: input.playerSessionId,
        roomCode: null
      };
      socket.emit(CLIENT_EVENTS.roomCreate, input);
    },
    joinRoom: (input) => {
      setError(null);
      setIsSubmitting(true);
      reconnectStateRef.current = {
        playerName: input.playerName,
        playerSessionId: input.playerSessionId,
        roomCode: input.roomCode.trim().toUpperCase()
      };
      socket.emit(CLIENT_EVENTS.roomJoin, input);
    },
    returnToLobby: () => {
      setError(null);
      setIsSubmitting(true);
      socket.emit(CLIENT_EVENTS.gameReturnToLobby);
    },
    sendStroke: (input) => {
      socket.emit(CLIENT_EVENTS.canvasStroke, input);
    },
    submitGuess: (input) => {
      setError(null);
      socket.emit(CLIENT_EVENTS.chatGuess, input);
    },
    startGame: () => {
      setError(null);
      setIsSubmitting(true);
      socket.emit(CLIENT_EVENTS.gameStart);
    },
    updateLobbySettings: (input) => {
      setError(null);
      setIsSubmitting(true);
      socket.emit(CLIENT_EVENTS.gameUpdateLobbySettings, input);
    }
  };
};

export const getDevRoomLabel = () => DEV_ROOM_CODE;
