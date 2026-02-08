import React, { createContext, useContext, useReducer, ReactNode, Dispatch } from 'react';
import { AppState, RouteResult } from '../domain/types';
import { MaritimeGraph } from '../domain/graph/Graph';

// --- Actions ---
type Action =
    | { type: 'SET_GRAPH'; payload: MaritimeGraph }
    | { type: 'SET_SELECTION_MODE'; payload: 'origin' | 'destination' | null }
    | { type: 'SET_ORIGIN'; payload: string | null }
    | { type: 'SET_DESTINATION'; payload: string | null }
    | { type: 'SET_ROUTE'; payload: RouteResult | null }
    | { type: 'TOGGLE_BLOCKADE_PORT'; payload: string }
    | { type: 'TOGGLE_BLOCKADE_CHOKEPOINT'; payload: string }
    | { type: 'SET_START_DATE'; payload: string }
    | { type: 'SET_SHIP_POSITION'; payload: [number, number] | null }
    | { type: 'RESET' };


// --- Initial State ---
const initialState: AppState = {
    graph: null,
    isGraphLoaded: false,
    selection: { originId: null, destId: null },
    blockades: { ports: new Set(), chokepoints: new Set() },
    route: null,
    simulation: { startDate: null, shipPosition: null }
};

// --- Reducer ---
function appReducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'SET_GRAPH':
            return { ...state, graph: action.payload.data, isGraphLoaded: true };
        case 'SET_ORIGIN':
            return { ...state, selection: { ...state.selection, originId: action.payload } };
        case 'SET_DESTINATION':
            return { ...state, selection: { ...state.selection, destId: action.payload } };
        case 'SET_ROUTE':
            return { ...state, route: action.payload };
        // ... Implement other reducers
        default:
            return state;
    }
}

// --- Context ---
const AppContext = createContext<{ state: AppState; dispatch: Dispatch<Action> } | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(appReducer, initialState);
    return (
        <AppContext.Provider value= {{ state, dispatch }
}>
    { children }
    </AppContext.Provider>
    );
}

export function useAppStore() {
    const context = useContext(AppContext);
    if (!context) throw new Error("useAppStore must be used within AppProvider");
    return context;
}
