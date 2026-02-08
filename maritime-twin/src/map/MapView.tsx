import { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useAppStore } from '../state/store';
import 'maplibre-gl/dist/maplibre-gl.css';

// Layers (we'll implement these as hooks or helper functions to keep this file clean)
import { useLanesLayer } from './layers/lanesLayer';
import { usePortsLayer } from './layers/portsLayer';
import { useShipLayer } from './layers/shipLayer';

export function MapView() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const [loaded, setLoaded] = useState(false);
    const { state } = useAppStore();

    // Initialize Map
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
            center: [0, 20],
            zoom: 1.5,
        });

        map.current.on('load', () => setLoaded(true));

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []);

    // Layers
    useLanesLayer(map.current, loaded, state.graph, state.route);
    usePortsLayer(map.current, loaded, state.graph, state.selection);
    useShipLayer(map.current, loaded, state.simulation.shipPosition);

    return <div ref={mapContainer} className="w-full h-full" />;
}
