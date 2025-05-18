import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import LayerPanel from './components/LayerPanel';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import L from 'leaflet';
import 'leaflet-draw';
import BotaoRecentrar from './components/BotaoRecentrar';


import {
  MapContainer,
  TileLayer,
  FeatureGroup,
  GeoJSON,
  } from 'react-leaflet';

import tokml from 'tokml';
import * as turf from '@turf/turf';

window.L = L;

const GEOSERVER_WFS_URL = '/geoserver/webgis/ows';


function MeasurementPanel({ tipo, unidade, setUnidade, resultado, onReset, onClose }) {
  return (
    <div id="measurement-panel">
      <button className="close-button" onClick={onClose}>✖</button>
      <h3>{tipo === 'polygon' ? 'MEDIR ÁREA' : 'MEDIR DISTÂNCIA'}</h3>
      <div className="unit-selector">
        <label>Unidade:</label>
        <select value={unidade} onChange={e => setUnidade(e.target.value)}>
          {tipo === 'polygon' ? (
            <>
              <option value="m²">m²</option>
              <option value="ha">hectares</option>
              <option value="km²">km²</option>
              <option value="alq">alqueires paulistas</option>
            </>
          ) : (
            <>
              <option value="m">metros</option>
              <option value="km">quilômetros</option>
            </>
          )}
        </select>
      </div>
      <div><strong>Resultado:</strong> {resultado}</div>
      <button className="reset-button" onClick={onReset}>Resetar</button>
    </div>
  );
}



function DrawTools({ mapRef, drawnItemsRef, fileInputRef, fileInputRefCAR, resetMapView, camadasImportadas, setCamadasImportadas, setDesenhos, areaDoImovelLayer, setAreaDoImovelLayer, camadas }) {
  const map = mapRef.current;
  const [showDrawSubmenu, setShowDrawSubmenu] = useState(false);
  const [showMeasureSubmenu, setShowMeasureSubmenu] = useState(false);
  const [tipoMedicao, setTipoMedicao] = useState(null);
  const [unidade, setUnidade] = useState('ha');
  const [resultado, setResultado] = useState('');

  const toggleMeasurementPanel = () => {
    setShowMeasureSubmenu(prev => {
      const novoEstado = !prev;
      if (!novoEstado) {
        setTipoMedicao(null);
        setResultado('');
      }
      return novoEstado;
    });
  };

  const verificarSobreposicao = () => {
    if (!areaDoImovelLayer) {
      alert("Área do imóvel não encontrada.");
      return;
    }
  
    const areaGeoJSON = areaDoImovelLayer.toGeoJSON();
    const areaFeatures = areaGeoJSON.type === 'FeatureCollection'
      ? areaGeoJSON.features
      : [areaGeoJSON];
  
    const areaFeatureCollection = turf.featureCollection(areaFeatures);
  
    const resultados = [];
  
    camadas.forEach(camada => {
      const nomeCamada = camada.nome.split(':').pop().toUpperCase();
      if (nomeCamada === 'ESTADOS') return;
  
      let temIntersecao = false;
  
      if (camada.data) {
        camada.data.features.forEach(feature => {
          try {
            const intersecta = turf.intersect(areaFeatureCollection, feature);
            if (intersecta) {
              temIntersecao = true;
            }
          } catch (e) {
            console.warn(`Erro ao verificar ${camada.nome}:`, e);
          }
        });
      }
  
      resultados.push({
        camada: camada.nome,
        sobreposicao: temIntersecao
      });
    });
  
    let texto = "🧾 Resultado da verificação:\n\n";
    resultados.forEach(r => {
      texto += `• ${r.camada}: ${r.sobreposicao ? '❌ Sobreposição detectada' : '✅ Sem sobreposição'}\n`;
    });
  
    alert(texto);
  };
  
  
  
  
  
  const startMeasurement = (tipo) => {
  setTipoMedicao(tipo);
  setResultado('');
  const options = { shapeOptions: { color: 'orange' } };
  const drawer = tipo === 'polygon'
    ? new L.Draw.Polygon(map, options)
    : new L.Draw.Polyline(map, options);

  drawer.enable();

  map.once(L.Draw.Event.CREATED, function (e) {
    const layer = e.layer;
    const geojson = layer.toGeoJSON();
    let valor = 0;
    let unidadeStr = '';

    if (tipo === 'polygon') {
      const areaM2 = turf.area(geojson);
      switch (unidade) {
        case 'm²':
          valor = areaM2;
          unidadeStr = 'm²';
          break;
        case 'ha':
          valor = areaM2 / 10000;
          unidadeStr = 'hectares';
          break;
        case 'km²':
          valor = areaM2 / 1e6;
          unidadeStr = 'km²';
          break;
        case 'alq':
          valor = areaM2 / 24200;
          unidadeStr = 'alqueires';
          break;
        default:
          valor = areaM2;
          unidadeStr = 'm²';
      }
    } else {
      const lengthKm = turf.length(geojson);
      if (unidade === 'km') {
        valor = lengthKm;
        unidadeStr = 'km';
      } else {
        valor = lengthKm * 1000;
        unidadeStr = 'm';
      }
    }

    const center = layer.getBounds().getCenter();
    L.popup()
      .setLatLng(center)
      .setContent(`<b>${valor.toFixed(2)} ${unidadeStr}</b>`)
      .openOn(map);

    setResultado(`${valor.toFixed(2)} ${unidadeStr}`);
    drawnItemsRef.current.addLayer(layer);
  });
};


  const resetMeasurement = () => {
    drawnItemsRef.current.clearLayers();
    setResultado('');
  };

  const startDraw = (tipo) => {
    const options = { shapeOptions: { color: '#3388ff' } };
    let drawer;
    switch (tipo) {
      case 'polygon': drawer = new L.Draw.Polygon(map, options); break;
      case 'rectangle': drawer = new L.Draw.Rectangle(map, options); break;
      case 'polyline': drawer = new L.Draw.Polyline(map, options); break;
      case 'marker': drawer = new L.Draw.Marker(map); break;
      default: return;
    }
    drawer.enable();
    map.once(L.Draw.Event.CREATED, function (e) {
      drawnItemsRef.current.addLayer(e.layer);
      setDesenhos(prev => [...prev, {
        tipo: tipo.charAt(0).toUpperCase() + tipo.slice(1),
        layer: e.layer,
        exportar: true
      }]);
    });
  }

  const exportarKML = () => {
    const geojson = drawnItemsRef.current.toGeoJSON();
    const kml = tokml(geojson);
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'desenhos.kml';
    a.click();
  };

  return (
    <>
      <div id="tool-sidebar">
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowDrawSubmenu(p => !p)} title="Desenhar">
            <img src="/icons/desenho.png" alt="Desenhar" style={{ width: '24px', height: '24px' }} />
          </button>
          {showDrawSubmenu && (
            <div className="tool-submenu">
              <button onClick={() => startDraw('polygon')} title="Polígono">
                <img src="/icons/poligono.png" alt="Polígono" style={{ width: '24px', height: '24px' }} />
              </button>

              <button onClick={() => startDraw('rectangle')} title="Retângulo">◼️</button>

              <button onClick={() => startDraw('polyline')} title="Linha">
                <img src="/icons/linha.png" alt="Linha" style={{ width: '24px', height: '24px' }} />
              </button>

              <button onClick={() => startDraw('marker')} title="Ponto">
                <img src="/icons/ponto.png" alt="Ponto" style={{ width: '24px', height: '24px' }} />
                </button>

              <button onClick={exportarKML} title="Exportar">
                <img src="/icons/salvar.png" alt="Exportar" style={{ width: '24px', height: '24px' }} />
              </button>

            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button onClick={toggleMeasurementPanel} title="Medir">
            <img src="/icons/medir.png" alt="Medir" style={{ width: '24px', height: '24px' }} />
          </button>
          {showMeasureSubmenu && (
            <div className="tool-submenu">
              <button onClick={() => startMeasurement('polygon')} title="Área">
                <img src="/icons/Area.png" alt="Área" style={{ width: '24px', height: '24px' }} />
              </button>
              <button onClick={() => startMeasurement('polyline')} title="Distância">
                <img src="/icons/regua.png" alt="Distância" style={{ width: '24px', height: '24px' }} />
                </button>
            </div>
          )}
        </div>

        <button onClick={() => fileInputRef.current.click()} title="Importar">
          <img src="/icons/folder.png" alt="Importar" style={{ width: '24px', height: '24px' }} />
        </button>
        <button onClick={() => fileInputRefCAR.current.click()} title="Importar CAR">🗂️</button>
        
        <button onClick={resetMapView} title="Recentralizar"><BotaoRecentrar />

</button>

        <button onClick={verificarSobreposicao} title="Checar Sobreposição">📋</button>
      </div>

      {tipoMedicao && (
        <MeasurementPanel
          tipo={tipoMedicao}
          unidade={unidade}
          setUnidade={setUnidade}
          resultado={resultado}
          onReset={resetMeasurement}
          onClose={() => {
            setTipoMedicao(null);
            setShowMeasureSubmenu(false);
            setResultado('');
          }}
        />
      )}
    </>
  );
}


export default function App() {
  const mapRef = useRef(null);
  const drawnItemsRef = useRef(new L.FeatureGroup());
  const fileInputRef = useRef(null);
  const fileInputRefCAR = useRef(null); // para arquivos .zip do CAR
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [camadas, setCamadas] = useState([]);
  const [camadasImportadas, setCamadasImportadas] = useState([]);
  const [ordemCamadasAtivas, setOrdemCamadasAtivas] = useState([]);
  const [desenhos, setDesenhos] = useState([]);
  const [areaDoImovelLayer, setAreaDoImovelLayer] = useState(null);

useEffect(() => {
  const zoomControl = document.querySelector('.leaflet-control-zoom');
  if (zoomControl) {
    zoomControl.style.left = isSidebarOpen ? '320px' : '10px';
  }
}, [isSidebarOpen]);



  useEffect(() => {
    fetch(`${GEOSERVER_WFS_URL}?service=WFS&request=GetCapabilities`)
      .then(res => res.text())
      .then(text => {
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "text/xml");
        const nodes = xml.getElementsByTagName("FeatureType");
        const nomes = Array.from(nodes).map(n =>
          n.getElementsByTagName("Name")[0].textContent
        );
        const camadasIniciais = nomes.map(nome => ({
          nome,
          data: null,
          visivel: false
        }));
        setCamadas(camadasIniciais);

        nomes.forEach(nome => {
          const url = `${GEOSERVER_WFS_URL}?service=WFS&version=1.0.0&request=GetFeature&typeName=${nome}&outputFormat=application/json`;
          fetch(url)
            .then(res => res.json())
            .then(data => {
              setCamadas(old =>
                old.map(c => c.nome === nome ? { ...c, data } : c)
              );
            });
        });
      });
  }, []);

  const toggleLayer = nome => {
    setCamadas(old =>
      old.map(c => c.nome === nome ? { ...c, visivel: !c.visivel } : c)
    );
  
    setOrdemCamadasAtivas(prev => {
      // Se estiver visível, remover da lista
      if (camadas.find(c => c.nome === nome)?.visivel) {
        return prev.filter(n => n !== nome);
      } else {
        // Se estiver invisível, adicionar no topo (ou ao fim se preferir)
        return [...prev, nome];
      }
    });
  };
  
  const toggleCamadaImportada = (nome) => {
    setCamadasImportadas(prev =>
      prev.map(c =>
        c.nome === nome
          ? { ...c, visivel: !c.visivel }
          : c
      )
    );
  
    const camada = camadasImportadas.find(c => c.nome === nome);
    if (camada) {
      if (camada.visivel) {
        drawnItemsRef.current.removeLayer(camada.layer);
      } else {
        drawnItemsRef.current.addLayer(camada.layer);
      }
    }
  };
  

  const bringToFront = nome => {
    const map = mapRef.current;
    if (!map) return;
    map.eachLayer(layer => {
      if (layer.feature?.properties?.nome === nome) {
        layer.bringToFront();
      }
    });
  };

 

const resetMapView = () => {
  console.log("📍 Botão Recentralizar foi clicado");
  const map = mapRef.current;
  if (map) {
    console.log("✅ Mapa encontrado. Recentralizando...");
    map.setView([-14.8, -51.5], 5);
  } else {
    console.warn("⚠️ Mapa não encontrado!");
  }
};





  const handleImport = e => {
    const file = e.target.files[0];
    if (!file || !mapRef.current) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const geo = JSON.parse(ev.target.result);
        const layer = new L.GeoJSON(geo);
        layer.addTo(drawnItemsRef.current);
        mapRef.current.fitBounds(layer.getBounds());
      } catch {
        alert('Formato inválido');
      }
    };
    reader.readAsText(file);
  };

  const handleImportCAR = (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    const formData = new FormData();
    formData.append('file', file);
  
    fetch('http://localhost:5000/importar_car', {
      method: 'POST',
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        Object.entries(data).forEach(([filename, geojson]) => {
          if (!geojson.features) {
            console.warn(`Erro ao importar ${filename}:`, geojson.error);
            return;
          }

  
          // 🔍 Exibe uma feature no console para depuração
          if (filename.includes('Cobertura_do_Solo')) {
            console.log('Exemplo de feature:', geojson.features[0]);
          }
          
          const layer = new L.GeoJSON(geojson, {
            style: (feature) => {
              const tema = feature?.properties?.tema?.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
              if (filename.includes('Area_do_Imovel')) {
                return { color: 'black', weight: 5, fillOpacity: 0 };
              }
  
              if (filename.includes('Reserva_Legal')) {
                return { color: 'green', weight: 2, fillOpacity: 0.3 };
              }
  
              if (filename.includes('Area_de_Preservacao_Permanente')) {
                return { color: 'red', weight: 2, fillOpacity: 0.3 };
              }
  
              if (filename.includes('Cobertura_do_Solo')) {
                // Mostra apenas a categoria desejada
                if (tema?.includes('Remanescente')) {
                  return { color: 'brown', weight: 2, fillOpacity: 0.3 };
                } else {
                  return { opacity: 0, fillOpacity: 0 }; // Oculta as demais
                }
              }
  
              // Estilo padrão para outros
              return { color: 'gray', weight: 1, fillOpacity: 0.1 };
            },
  
            onEachFeature: (feature, layer) => {
              const tema = feature?.properties?.tema?.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
              // 🧹 Ignora feições que não são "Remanescente"
              if (
                filename.includes('Cobertura_do_Solo') &&
                !tema?.includes('Remanescente')
              ) {
                return;
              }
  
              layer.bindPopup(`<b>${filename}</b><br>${feature?.properties?.tema || ''}`);
            }
          });
  
          // Adiciona ao grupo de desenho
          layer.addTo(drawnItemsRef.current);
  
          // Salva no estado
          setCamadasImportadas(prev => [
            ...prev,
            {
              nome: filename,
              layer: layer,
              visivel: true
            }
          ]);

          if (filename.includes('Area_do_Imovel')) {
            setAreaDoImovelLayer(layer); // salvar esse layer em um estado
          }
          
  
          // Centraliza no mapa
          if (mapRef.current && layer.getBounds) {
            mapRef.current.fitBounds(layer.getBounds());
          }
        });
      })
      

      
      .catch(err => {
        alert('Erro ao importar arquivo do CAR');
        console.error(err);
      });
  };
  
  const alternarDesenhoParaExportacao = (index) => {
    setDesenhos(prev => {
      const atualizados = [...prev];
      atualizados[index].exportar = !atualizados[index].exportar;
      return atualizados;
    });
  };
  
  const removerTodosDesenhos = () => {
    desenhos.forEach(d => {
      drawnItemsRef.current.removeLayer(d.layer);
    });
    setDesenhos([]);
  };
  
  
  return (
    <div>
      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(o => !o)}>
  <h2>Camadas</h2>

  <h3>Banco de Dados</h3>

<ul>
  {camadas
    .filter(c =>
      !c.nome.split(':').pop().toUpperCase().startsWith('FPB') &&
      ![
        'ASSENTAMENTO',
        'QUILOMBOLA',
        'TERRAS INDÍGENAS',
        'UNIDADES DE CONSERVAÇÃO'
      ].includes(c.nome.split(':').pop().toUpperCase())
    )
    .map((c, index) => {
      const nomeLimpo = c.nome.includes(':') ? c.nome.split(':')[1] : c.nome;
      return (
        <li key={index}>
          <label>
            <input
              type="checkbox"
              checked={c.visivel}
              onChange={() => toggleLayer(c.nome)}
            />
            {nomeLimpo}
          </label>
        </li>
      );
    })}
</ul>

<details style={{ marginTop: '10px' }}>
  <summary style={{ cursor: 'pointer' }}><strong>Florestas Públicas (FPB)</strong></summary>
  <ul>
    {camadas
      .filter(c => c.nome.split(':').pop().toUpperCase().startsWith('FPB'))
      .map((c, index) => {
        const nomeLimpo = c.nome.split(':').pop();
        return (
          <li key={index}>
            <label>
              <input
                type="checkbox"
                checked={c.visivel}
                onChange={() => toggleLayer(c.nome)}
              />
              {nomeLimpo}
            </label>
          </li>
        );
      })}
  </ul>
</details>

<details style={{ marginTop: '10px' }}>
  <summary style={{ cursor: 'pointer' }}><strong>Áreas Protegidas</strong></summary>
  <ul>
    {camadas
      .filter(c =>
        ['ASSENTAMENTO', 'QUILOMBOLA', 'TERRAS INDÍGENAS', 'UNIDADES DE CONSERVAÇÃO'].includes(
          c.nome.split(':').pop().toUpperCase()
        )
      )
      .map((c, index) => {
        const nomeLimpo = c.nome.split(':').pop();
        return (
          <li key={index}>
            <label>
              <input
                type="checkbox"
                checked={c.visivel}
                onChange={() => toggleLayer(c.nome)}
              />
              {nomeLimpo}
            </label>
          </li>
        );
      })}
  </ul>
</details>

  <h3>Importadas (CAR)</h3>
  <ul>
    {camadasImportadas.map((c, index) => (
      <li key={index}>
        <label>
          <input
            type="checkbox"
            checked={c.visivel}
            onChange={() => toggleCamadaImportada(c.nome)}
          />
          {c.nome}
        </label>
      </li>
    ))}
  </ul>

  <h3>Desenhos Manuais</h3>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span>Todos os desenhos</span>
    <button onClick={removerTodosDesenhos} style={{ fontSize: '0.8em' }}>
      <img src="/icons/lixo.png" alt="Remover" style={{ width: '24px', height: '24px' }} />
    </button>
  </div>
  <ul>
    {desenhos.map((d, i) => (
      <li key={i}>
        <label>
          <input
            type="checkbox"
            checked={d.exportar}
            onChange={() => alternarDesenhoParaExportacao(i)}
          />
          {d.tipo}
        </label>
      </li>
    ))}
  </ul>
</Sidebar>



      <LayerPanel
  camadas={camadas}
  toggleLayer={toggleLayer}
  bringToFront={bringToFront}
  ordemCamadasAtivas={ordemCamadasAtivas}
  setOrdemCamadasAtivas={setOrdemCamadasAtivas}
/>



      <MapContainer
  id="map"
  center={[-14.8, -51.5]}
  zoom={5}
  whenCreated={map => {
    mapRef.current = map; // ✅ isso é ESSENCIAL
    drawnItemsRef.current.addTo(map);
  }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {camadas.map(c =>
          c.visivel && c.data ? (
            <GeoJSON
              key={c.nome}
              data={c.data}
              onEachFeature={(feature, layer) => {
                feature.properties = feature.properties || {};
                feature.properties.nome = c.nome;
                layer.bindPopup(`<b>${c.nome}</b>`);
              }}
              style={(feature) => {
                const nome = c.nome.split(':').pop().toUpperCase();
              
                if (nome === 'EMBARGO IBAMA') {
                  return {
                    color: 'red',
                    weight: 2,
                    dashArray: '5, 5', // estilo tracejado (hashed)
                    fillOpacity: 0.1
                  };
                }
              
                if (nome === 'ESTADOS') {
                  return {
                    color: 'BLUE',
                    weight: 1,
                    fillOpacity: 0
                  };
                }
              
                if (nome === 'MAPBIOMAS') {
                  return {
                    color: '#1f78b4',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
              
                if (nome === 'ASSENTAMENTO') {
                  return {
                    color: '#33a02c',
                    fillOpacity: 0.2
                  };
                }
              
                if (nome === 'QUILOMBOLA') {
                  return {
                    color: '#6a3d9a',
                    dashArray: '4,4',
                    fillOpacity: 0.15
                  };
                }
              
                if (nome === 'TERRAS INDÍGENAS') {
                  return {
                    color: '#e31a1c',
                    fillOpacity: 0.25
                  };
                }
              
                if (nome === 'UNIDADES DE CONSERVAÇÃO') {
                  return {
                    color: '#ff7f00',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }

                if (nome === 'FPB AC') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }

                if (nome === 'FPB AL') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB AM') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB AP') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB BA') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB CE') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB GO') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB MA') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB MS') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB MT') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB PA') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB PE') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB PI') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB PR') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB RO') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB RR') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB RS') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB SC') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                if (nome === 'FPB TO') {
                  return {
                    color: '#4fb286',
                    weight: 1.5,
                    fillOpacity: 0.2
                  };
                }
                

                // estilo padrão
                return {
                  color: '#3388ff',
                  weight: 2,
                  fillOpacity: 0.1
                };
              }}            
            />
          ) : null
        )}
        <FeatureGroup ref={drawnItemsRef}></FeatureGroup>
        <DrawTools
          mapRef={mapRef}
          drawnItemsRef={drawnItemsRef}
          fileInputRef={fileInputRef}
          fileInputRefCAR={fileInputRefCAR}
          resetMapView={resetMapView}
          camadasImportadas={camadasImportadas}
          setCamadasImportadas={setCamadasImportadas}
          setDesenhos={setDesenhos}  // 👈 adicionado
          areaDoImovelLayer={areaDoImovelLayer}
          setAreaDoImovelLayer={setAreaDoImovelLayer} // ✅ ADICIONE ESTA LINHA
          camadas={camadas}
        />
        <BotaoRecentrar />
      </MapContainer>

      <input
        type="file"
        ref={fileInputRef}
        accept=".geojson,.json,.kml,.gpx"
        style={{ display: 'none' }}
        onChange={handleImport}
      />
      <input
        type="file"
        ref={fileInputRefCAR}
        accept=".zip"
        style={{ display: 'none' }}
        onChange={handleImportCAR}
      />

      <footer>© Murilo Tavares</footer>
    </div>
  );
}
