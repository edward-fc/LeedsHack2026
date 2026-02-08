import { useEffect } from 'react';
import { useAppStore } from '../../state/store';
import { MaritimeGraph } from '../../domain/graph/Graph';
import { MapView } from '../../map/MapView';
import { ControlPanel } from '../components/ControlPanel';

export function MaritimeTwinPage() {
    const { state, dispatch } = useAppStore();

    useEffect(() => {
        // Load Graph Logic
        MaritimeGraph.load('/data/graph.json').then(graph => {
            dispatch({ type: 'SET_GRAPH', payload: graph });
        });
    }, [dispatch]);

    if (!state.isGraphLoaded) return <div>Loading...</div>;

    return (
        <div className="relative w-full h-full">
            <ControlPanel />
            <MapView />
        </div>
    );
}
