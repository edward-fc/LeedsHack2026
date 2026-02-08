import { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAppStore } from '../../state/AppStore';
import { useWeatherLayer } from '../../map/hooks/useWeatherLayer';
import { unwrapAntimeridian } from '../../utils/geo';

export function MapView() {
    const {
        graph,
        togglePort,
        toggleChokepoint,
        pathEdgeIds,
        originId,
        destId,
        shipPosition,
        weatherConfig,
        selectionMode,
        setSelectionMode,
        setOriginId,
        setDestId,
        route // Extract route from store
    } = useAppStore();

    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null); // Use maplibre types
    const [loaded, setLoaded] = useState(false);

    // Weather Layer Hook
    useWeatherLayer(map.current, weatherConfig);

    // Update Data Sources (Lanes, Ports, Route)
    useEffect(() => {
        if (!loaded || !map.current || !graph) return;
        const m = map.current;

        // 1. Lanes Source
        const adjEdges = Object.values(graph.adjList).flat();
        const laneFeatures = adjEdges.flatMap((edge, i) => {
            const geometry = edge.geometry;

            if (geometry && geometry.length === 2) {
                const [p1, p2] = geometry;
                const lon1 = p1[0];
                const lon2 = p2[0];
                const lat1 = p1[1];
                const lat2 = p2[1];

                if (Math.abs(lon2 - lon1) > 180) {
                    // Dateline crossing
                    // Construct East-side version and West-side version

                    let eastP1 = [lon1, lat1];
                    let eastP2 = [lon2, lat2];
                    let westP1 = [lon1, lat1];
                    let westP2 = [lon2, lat2];

                    if (lon1 > 0 && lon2 < 0) {
                        // East -> West (e.g. 179 -> -179)
                        // East ver: 179 -> 181 ((-179)+360)
                        eastP2 = [lon2 + 360, lat2];
                        // West ver: -181 ((179)-360) -> -179
                        westP1 = [lon1 - 360, lat1];
                    } else if (lon1 < 0 && lon2 > 0) {
                        // West -> East (e.g. -179 -> 179)
                        // East ver: 181 ((-179)+360) -> 179
                        // Wait, 181 -> 179 is just normal. 
                        // Target is 179. Source is -179.
                        // East ver: (-179 + 360) -> 179 => 181 -> 179.
                        eastP1 = [lon1 + 360, lat1];

                        // West ver: -179 -> -181 ((179)-360).
                        westP2 = [lon2 - 360, lat2];
                    }

                    // Create two features
                    const props = {
                        id: String(i),
                        lane_id: edge.lane_id,
                        disabled: graph.isEdgeDisabled(edge),
                        isPath: pathEdgeIds.has(edge.lane_id)
                    };

                    return [
                        { type: 'Feature', geometry: { type: 'LineString', coordinates: [eastP1, eastP2] }, properties: { ...props, wrap: 'east' } },
                        { type: 'Feature', geometry: { type: 'LineString', coordinates: [westP1, westP2] }, properties: { ...props, wrap: 'west' } }
                    ];
                }
            }

            // Normal Edge
            return [{
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: geometry },
                properties: {
                    id: String(i),
                    lane_id: edge.lane_id,
                    disabled: graph.isEdgeDisabled(edge),
                    isPath: pathEdgeIds.has(edge.lane_id),
                    wrap: 'none'
                }
            }];
        });

        const lanesGeoJSON = { type: 'FeatureCollection', features: laneFeatures };
        if (m.getSource('lanes')) {
            (m.getSource('lanes') as maplibregl.GeoJSONSource).setData(lanesGeoJSON as any);
        }

        // 2. Ports Source
        const portFeatures = Object.values(graph.ports).map(port => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [port.lon, port.lat] },
            properties: {
                id: port.id,
                name: port.name,
                isOrigin: port.id === originId,
                isDest: port.id === destId,
                disabled: graph.disabledPorts.has(port.id)
            }
        }));
        if (m.getSource('ports')) {
            (m.getSource('ports') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: portFeatures } as any);
        }

        // 3. Chokepoints Source
        const chokeFeatures = Object.values(graph.chokepoints).map(cp => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [cp.lon, cp.lat] },
            properties: {
                name: cp.name,
                disabled: graph.disabledChokepoints.has(cp.name)
            }
        }));
        if (m.getSource('chokepoints')) {
            (m.getSource('chokepoints') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: chokeFeatures } as any);
        }

        // 4. Route Layer (Continuous Unwrapped Line)
        if (route && route.geometry) {
            const unwrappedGeometry = unwrapAntimeridian(route.geometry);
            const routeGeoJSON = {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: unwrappedGeometry },
                properties: {}
            };

            if (m.getSource('route')) {
                (m.getSource('route') as maplibregl.GeoJSONSource).setData(routeGeoJSON as any);
            } else {
                m.addSource('route', { type: 'geojson', data: routeGeoJSON as any });
                m.addLayer({
                    id: 'route-layer',
                    type: 'line',
                    source: 'route',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': '#00bfff', // Bright Blue
                        'line-width': 5,
                        'line-opacity': 0.8
                    }
                }, 'ship-layer');
            }
        } else {
            if (m.getLayer('route-layer')) m.removeLayer('route-layer');
            if (m.getSource('route')) m.removeSource('route');
        }

    }, [loaded, graph, pathEdgeIds, originId, destId, graph?.disabledPorts, graph?.disabledChokepoints, route]);

    // Handlers
    const onPortClick = (portId: string) => {
        if (selectionMode === 'origin') {
            setOriginId(portId);
            setSelectionMode(null);
        } else if (selectionMode === 'destination') {
            setDestId(portId);
            setSelectionMode(null);
        } else {
            togglePort(portId);
        }
    };

    const onChokepointClick = (name: string) => {
        toggleChokepoint(name);
    };

    // Refs to keep latest handlers available to MapLibre listeners without cleanup/rebind overhead
    const onPortClickRef = useRef(onPortClick);
    const onChokepointClickRef = useRef(onChokepointClick);

    useEffect(() => {
        onPortClickRef.current = onPortClick;
        onChokepointClickRef.current = onChokepointClick;
    }, [onPortClick, onChokepointClick]);

    useEffect(() => {
        if (map.current) return;
        if (!mapContainer.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
            center: [0, 20],
            zoom: 1.5,
        });

        map.current.on('load', () => {
            setLoaded(true);
        });

        // Error Handling
        map.current.on('error', (e) => {
            if (e && e.error && e.error.status === 401) {
                console.error("Map Resource 401 Error:", e.error);
                // Check if it's OpenWeatherMap
                if (e.error.url && e.error.url.includes('openweathermap')) {
                    alert("OpenWeatherMap Error: The API Key is invalid or not authorized for Tile layers. Please check your .env file or wait for the key to activate.");
                }
            }
        });

        // Cleanup function for React Strict Mode
        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
                setLoaded(false);
            }
        };
    }, []);

    // Ship Marker Update
    useEffect(() => {
        if (!loaded || !map.current) return;
        const m = map.current;

        const shipGeoJSON = {
            type: 'FeatureCollection',
            features: shipPosition ? [{
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: shipPosition
                },
                properties: {}
            }] : []
        };

        if (m.getSource('ship')) {
            (m.getSource('ship') as maplibregl.GeoJSONSource).setData(shipGeoJSON as any);
        } else {
            m.addSource('ship', { type: 'geojson', data: shipGeoJSON as any });
            m.addLayer({
                id: 'ship-layer',
                type: 'circle',
                source: 'ship',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#0000ff', // Blue
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                    'circle-pitch-alignment': 'map'
                }
            });
            // Pulse animation layer (optional, can add later)
        }
    }, [loaded, shipPosition]);

    // Update Data Sources
    useEffect(() => {
        if (!loaded || !map.current) return;
        const m = map.current;

        // 1. Lanes Source
        const laneFeatures = Object.values(graph.adjList).flat().flatMap((edge, i) => {
            const originalCoordinates = edge.geometry;
            const features = [];

            if (originalCoordinates && originalCoordinates.length === 2) {
                const [p1, p2] = originalCoordinates;
                const lon1 = p1[0];
                const lon2 = p2[0];

                if (Math.abs(lon2 - lon1) > 180) {
                    // DATELINE CROSSING DETECTED
                    // We need to render TWO lines to cover both sides of the map (World -1 and World 0/1 boundary).

                    // 1. Right-side wrapping (e.g., 179 -> 181)
                    // If going West->East (179 -> -179): 179 -> 181
                    // If going East->West (-179 -> 179): 181 -> 179
                    const rightP1: [number, number] = [p1[0], p1[1]];
                    const rightP2: [number, number] = [p2[0], p2[1]];

                    if (lon1 > 0 && lon2 < 0) { rightP2[0] += 360; }
                    else if (lon1 < 0 && lon2 > 0) { rightP1[0] += 360; }

                    features.push({
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: [rightP1, rightP2] },
                        properties: {
                            id: `${i}-right`,
                            lane_id: edge.lane_id,
                            disabled: graph.isEdgeDisabled(edge),
                            isPath: pathEdgeIds.has(edge.lane_id)
                        }
                    });

                    // 2. Left-side wrapping (e.g., -181 -> -179)
                    // If going West->East (179 -> -179): -181 -> -179
                    const leftP1: [number, number] = [p1[0], p1[1]];
                    const leftP2: [number, number] = [p2[0], p2[1]];

                    if (lon1 > 0 && lon2 < 0) { leftP1[0] -= 360; }
                    else if (lon1 < 0 && lon2 > 0) { leftP2[0] -= 360; }

                    features.push({
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: [leftP1, leftP2] },
                        properties: {
                            id: `${i}-left`,
                            lane_id: edge.lane_id,
                            disabled: graph.isEdgeDisabled(edge),
                            isPath: pathEdgeIds.has(edge.lane_id)
                        }
                    });

                    return features;
                }
            }

            // Normal Edge
            return [{
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: edge.geometry
                },
                properties: {
                    id: String(i),
                    lane_id: edge.lane_id,
                    disabled: graph.isEdgeDisabled(edge),
                    isPath: pathEdgeIds.has(edge.lane_id)
                }
            }];
        });

        // Deduplicate edges?
        // Using Map as unique set by geometry string might be heavy. Just render.

        const lanesGeoJSON = { type: 'FeatureCollection', features: laneFeatures };

        if (m.getSource('lanes')) {
            (m.getSource('lanes') as maplibregl.GeoJSONSource).setData(lanesGeoJSON as any);
        } else {
            m.addSource('lanes', { type: 'geojson', data: lanesGeoJSON as any });
            m.addLayer({
                id: 'lanes-layer',
                type: 'line',
                source: 'lanes',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': [
                        'case',
                        ['get', 'disabled'], '#ff0000', // Red if disabled
                        ['get', 'isPath'], '#00ff00', // Green if part of path
                        '#004488' // Default Navy Blue
                    ],
                    'line-width': [
                        'case',
                        ['get', 'isPath'], 4, // Thicker if path
                        1 // Default width
                    ],
                    'line-opacity': [
                        'case',
                        ['get', 'isPath'], 0.8,
                        ['get', 'disabled'], 0.8,
                        0.6
                    ]
                }
            });
        }

        // 2. Ports Source
        const portFeatures = Object.values(graph.ports).map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
            properties: {
                id: p.id,
                name: p.name,
                disabled: graph.disabledPorts.has(p.id),
                isOrigin: p.id === originId,
                isDest: p.id === destId
            }
        }));

        const portsGeoJSON = { type: 'FeatureCollection', features: portFeatures };

        if (m.getSource('ports')) {
            (m.getSource('ports') as maplibregl.GeoJSONSource).setData(portsGeoJSON as any);
        } else {
            m.addSource('ports', { type: 'geojson', data: portsGeoJSON as any });
            m.addLayer({
                id: 'ports-layer',
                type: 'circle',
                source: 'ports',
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 5, 8],
                    'circle-color': [
                        'case',
                        ['get', 'disabled'], '#555555', // Grey if disabled
                        ['any', ['get', 'isOrigin'], ['get', 'isDest']], '#00ff00', // Green if O/D
                        '#ff3300' // Default Red-Orange
                    ],
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff'
                }
            });

            // Interaction
            m.on('click', 'ports-layer', (e) => {
                if (e.features && e.features[0].properties) {
                    onPortClickRef.current(e.features[0].properties.id);
                }
            });
            m.on('mouseenter', 'ports-layer', () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', 'ports-layer', () => { m.getCanvas().style.cursor = ''; });
        }

        // 2b. Port Links Source (Visualizing the connection)
        const linkFeatures = Object.values(graph.ports).map(p => {
            const targetNode = graph.nodes[p.node_id];
            if (!targetNode) return null;
            return {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [p.lon, p.lat],
                        [targetNode.lon, targetNode.lat]
                    ]
                },
                properties: {}
            };
        }).filter(f => f !== null);

        const linksGeoJSON = { type: 'FeatureCollection', features: linkFeatures };

        if (m.getSource('port-links')) {
            (m.getSource('port-links') as maplibregl.GeoJSONSource).setData(linksGeoJSON as any);
        } else {
            m.addSource('port-links', { type: 'geojson', data: linksGeoJSON as any });
            m.addLayer({
                id: 'port-links-layer',
                type: 'line',
                source: 'port-links',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#888888',
                    'line-width': 1,
                    'line-dasharray': [2, 2],
                    'line-opacity': 0.7
                }
            }, 'ports-layer'); // Draw links BEFORE ports (so ports sit on top)
        }

        // 3. Chokepoints Source
        const cpFeatures = Object.values(graph.chokepoints).map(cp => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [cp.lon, cp.lat] },
            properties: {
                name: cp.name,
                disabled: graph.disabledChokepoints.has(cp.name)
            }
        }));

        const cpGeoJSON = { type: 'FeatureCollection', features: cpFeatures };

        if (m.getSource('chokepoints')) {
            (m.getSource('chokepoints') as maplibregl.GeoJSONSource).setData(cpGeoJSON as any);
        } else {
            m.addSource('chokepoints', { type: 'geojson', data: cpGeoJSON as any });
            m.addLayer({
                id: 'chokepoints-layer',
                type: 'symbol',
                source: 'chokepoints',
                layout: {
                    // MapLibre default styles might not have 'star' icon.
                    // Fallback to simpler marker or circle + text if icon missing.
                    // Voyager style has icons. 
                    // Let's use circle plus text layer.
                    'text-field': ['get', 'name'],
                    'text-offset': [0, 1.5],
                    'text-size': 12,
                    'text-font': ['Open Sans Bold'] // Usually available
                },
                paint: {
                    'text-color': '#000',
                    'text-halo-color': '#fff',
                    'text-halo-width': 2
                }
            });
            // Use circle for marker
            m.addLayer({
                id: 'chokepoints-marker',
                type: 'circle',
                source: 'chokepoints',
                paint: {
                    'circle-radius': 8,
                    'circle-color': ['case', ['get', 'disabled'], '#ff0000', '#000000'],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#FFD700' // Gold
                }
            });

            m.on('click', 'chokepoints-marker', (e) => {
                if (e.features && e.features[0].properties) {
                    onChokepointClickRef.current(e.features[0].properties.name);
                }
            });
            m.on('mouseenter', 'chokepoints-marker', () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', 'chokepoints-marker', () => { m.getCanvas().style.cursor = ''; });
        }

        // Clean up old route layer if it exists
        if (m.getLayer('route-layer')) m.removeLayer('route-layer');
        if (m.getSource('route')) m.removeSource('route');

    }, [loaded, graph, pathEdgeIds, originId, destId, graph.disabledPorts, graph.disabledChokepoints]);

    return <div ref={mapContainer} className="w-full h-full" />;
}
