import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { SargazoService, SargazoPoint, SargazoConcentration, SargazoTrajectory } from '../services/sargazo.service';

@Component({
  selector: 'app-pages',
  templateUrl: './pages.html',
  styleUrls: ['./pages.css'],
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [SargazoService]
})
export class PagesComponent implements AfterViewInit, OnDestroy {
  private map!: L.Map;
  public sidebarVisible: boolean = true;
  private sargazoLayer!: L.LayerGroup;
  private trajectoryLine!: L.Polyline;
  
  // Variables para la animación
  public currentStep: number = 0;
  public totalSteps: number = 0;
  public isAnimating: boolean = false;
  private animationInterval: any;
  private allConcentrations: SargazoConcentration[] = [];
  private trajectories: SargazoTrajectory[] = [];

  // Filtros
  public selectedCoast: string = '';
  public selectedDate: string = '';
  public selectedStartDate: string = '';
  public selectedEndDate: string = '';
  public todayDate: string = '';

  // Estado de carga
  public isLoading: boolean = false;
  public loadingMessage: string = 'Cargando predicciones de sargazo...';

  // Datos calculados para las cards
  public totalAffectedCoasts: number = 0;
  public totalBiomassKm2: number = 0;
  public highRiskZones: number = 0;
  public topAffectedZones: { name: string; biomassKm2: number; density: number; riskLevel: string }[] = [];

  constructor(
    private sargazoService: SargazoService,
    private cdr: ChangeDetectorRef
  ) {
    // Establecer fecha de hoy por defecto
    const today = new Date();
    this.todayDate = today.toISOString().split('T')[0];
    this.selectedDate = this.todayDate;
    this.selectedStartDate = this.todayDate;
    this.selectedEndDate = this.todayDate;
  }

  ngAfterViewInit(): void {
    // NO inicializar el mapa aquí, esperar a que carguen los datos
    this.loadSargazoData();
  }

  toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
    
    // Esperar a que Angular actualice el DOM antes de invalidar el tamaño del mapa
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize(true);
      }
    }, 350);
  }

  // Métodos de filtrado
  public onCoastChange(event: any): void {
    this.selectedCoast = event.target.value;
    this.applyFilters();
  }

  public onDateChange(event: any): void {
    // Actualizar ambas fechas si es necesario
    this.applyFilters();
  }

  private applyFilters(): void {
    console.log('🔍 Filtros aplicados:', {
      costa: this.selectedCoast || 'Todas las costas',
      fechaInicio: this.selectedStartDate,
      fechaFinal: this.selectedEndDate
    });
    
    // Si ya tenemos datos cargados, solo re-renderizar con los filtros
    if (this.trajectories.length > 0 && this.allConcentrations.length > 0 && this.map) {
      console.log('✅ Datos ya en memoria - Re-renderizando sin llamar a la API');
      
      // Limpiar capa actual
      if (this.sargazoLayer) {
        this.sargazoLayer.clearLayers();
      }
      
      // Aplicar filtros y re-dibujar
      let filteredTrajectories = this.trajectories;
      if (this.selectedCoast) {
        filteredTrajectories = this.trajectories.filter(t => t.location === this.selectedCoast);
      }
      
      this.displaySargazoTrajectories(filteredTrajectories);
      this.updateAnimationStep();
      
      // Ajustar vista del mapa
      if (filteredTrajectories.length > 0 && filteredTrajectories[0].points.length > 0) {
        const bounds = L.latLngBounds(
          filteredTrajectories[0].points.map(p => [p.latitude, p.longitude] as L.LatLngExpression)
        );
        this.map.fitBounds(bounds, { padding: [50, 50] });
      }
    } else {
      // Primera vez o no hay datos - cargar desde API
      console.log('📡 No hay datos en memoria - Cargando desde API...');
      this.loadSargazoData();
    }
  }

  private loadSargazoData(): void {
    console.log('🔄 Cargando datos de sargazo...');
    this.isLoading = true;
    this.loadingMessage = 'Cargando predicciones de sargazo...';
    
    // Hacer UNA SOLA llamada al API y procesar ambos datos
    console.log('� Iniciando ÚNICA petición a la API...');
    this.sargazoService.getSargazoTrajectories().subscribe({
      next: (trajectories) => {
        console.log('📍 ✅ Trayectorias recibidas:', trajectories);
        console.log('📍 Número de trayectorias:', trajectories.length);
        this.trajectories = trajectories;
        
        // Ahora cargar concentraciones (que usa CACHÉ o la misma respuesta)
        this.loadingMessage = 'Calculando concentraciones de sargazo...';
        console.log('📡 Cargando concentraciones...');
        
        this.sargazoService.getSargazoConcentrationPoints().subscribe({
          next: (concentrations) => {
            console.log('🔴 ✅ Concentraciones recibidas:', concentrations.length);
            console.log('🔴 Detalle de concentraciones:', concentrations);
            this.allConcentrations = concentrations;
            this.totalSteps = concentrations.length;
            this.currentStep = 0;
            console.log(`📊 Total de pasos: ${this.totalSteps}`);
            
            // Calcular estadísticas para las cards
            this.calculateStatistics();
            
            console.log('✅ TODOS LOS DATOS LISTOS - Ocultando loader');
            this.isLoading = false;
            
            // Forzar detección de cambios para que Angular renderice el DOM
            console.log('🔄 Forzando detección de cambios...');
            this.cdr.detectChanges();
            
            // Inicializar el mapa DESPUÉS de que Angular actualice el DOM
            console.log('⏳ Esperando renderizado del DOM...');
            setTimeout(() => {
              console.log('🗺️ Iniciando initMap()...');
              this.initMap();
              console.log('📊 Cargando datos en el mapa...');
              this.loadSargazoData2();
            }, 50);
          },
          error: (error) => {
            console.error('❌ ERROR cargando concentraciones:', error);
            this.isLoading = false;
          }
        });
      },
      error: (error) => {
        console.error('❌ ERROR cargando trayectorias:', error);
        this.isLoading = false;
      }
    });
    
    console.log('📡 Petición iniciada, esperando respuesta...');
  }

  private loadSargazoData2(): void {
    console.log('🎨 Dibujando datos iniciales en el mapa (SIN llamar a la API)...');
    
    // Usar los datos YA CARGADOS en memoria (this.trajectories)
    if (this.trajectories) {
      let filteredTrajectories = this.trajectories;
      if (this.selectedCoast) {
        filteredTrajectories = this.trajectories.filter(t => t.location === this.selectedCoast);
      }
      
      console.log(`📍 Dibujando ${filteredTrajectories.length} trayectorias desde memoria`);
      this.displaySargazoTrajectories(filteredTrajectories);
      
      // Ajustar el mapa
      if (filteredTrajectories.length > 0 && filteredTrajectories[0].points.length > 0) {
        const bounds = L.latLngBounds(
          filteredTrajectories[0].points.map(p => [p.latitude, p.longitude] as L.LatLngExpression)
        );
        this.map.fitBounds(bounds, { padding: [50, 50] });
        console.log('🗺️ Mapa ajustado a las coordenadas');
      }
    }

    // Mostrar primer paso de la animación (usando datos en memoria)
    console.log('🎬 Mostrando primer paso de animación...');
    this.updateAnimationStep();
  }

  private filterByCoast(points: any[], coast: string): any[] {
    // Definir coordenadas aproximadas de cada localidad (lat, lng)
    const locations: { [key: string]: { lat: number, lng: number, radius: number } } = {
      // Yucatán
      'progreso': { lat: 21.2817, lng: -89.6650, radius: 0.3 },
      'telchac': { lat: 21.3383, lng: -89.2667, radius: 0.3 },
      'dzilam': { lat: 21.3833, lng: -88.9000, radius: 0.3 },
      'san-felipe': { lat: 21.5667, lng: -88.2500, radius: 0.3 },
      'rio-lagartos': { lat: 21.6000, lng: -88.1500, radius: 0.3 },
      
      // Quintana Roo
      'cancun': { lat: 21.1619, lng: -86.8515, radius: 0.4 },
      'puerto-morelos': { lat: 20.8508, lng: -86.8739, radius: 0.3 },
      'playa-del-carmen': { lat: 20.6296, lng: -87.0739, radius: 0.3 },
      'akumal': { lat: 20.3953, lng: -87.3153, radius: 0.3 },
      'tulum': { lat: 20.2114, lng: -87.4654, radius: 0.4 },
      'mahahual': { lat: 18.7097, lng: -87.7089, radius: 0.3 },
      'xcalak': { lat: 18.2667, lng: -87.8333, radius: 0.3 }
    };

    if (locations[coast]) {
      const location = locations[coast];
      // Filtrar puntos dentro del radio de la localidad
      const filtered = points.filter(point => {
        const latDiff = Math.abs(point.latitude - location.lat);
        const lngDiff = Math.abs(point.longitude - location.lng);
        return latDiff <= location.radius && lngDiff <= location.radius;
      });
      
      // Si hay puntos filtrados, centrar el mapa en la localidad
      if (filtered.length > 0 && this.map) {
        this.map.setView([location.lat, location.lng], 10);
      }
      
      return filtered;
    }
    
    // Si no hay filtro o no se encuentra la localidad, resetear vista
    if (this.map && !coast) {
      this.map.setView([20.8, -88.0], 7);
    }
    
    return points;
  }

  // Métodos de control de animación
  public nextStep(): void {
    if (this.currentStep < this.totalSteps - 1) {
      this.currentStep++;
      this.updateAnimationStep();
    }
  }

  public previousStep(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.updateAnimationStep();
    }
  }

  public toggleAnimation(): void {
    this.isAnimating = !this.isAnimating;
    
    if (this.isAnimating) {
      // Iniciar animación automática
      this.animationInterval = setInterval(() => {
        if (this.currentStep < this.totalSteps - 1) {
          this.nextStep();
        } else {
          // Reiniciar cuando llegue al final
          this.currentStep = 0;
          this.updateAnimationStep();
        }
      }, 1500); // Cada 1.5 segundos
    } else {
      // Pausar animación
      if (this.animationInterval) {
        clearInterval(this.animationInterval);
      }
    }
  }

  private updateAnimationStep(): void {
    console.log(`🎬 Actualizando paso de animación: ${this.currentStep + 1}/${this.totalSteps}`);
    
    // Mostrar información del punto actual
    if (this.allConcentrations[this.currentStep]) {
      const currentPoint = this.allConcentrations[this.currentStep];
      console.log(`📍 Punto actual (paso ${this.currentStep + 1}):`, {
        lat: currentPoint.latitude,
        lng: currentPoint.longitude,
        biomasa: currentPoint.area_m2,
        densidad: currentPoint.density
      });
    }
    
    // Limpiar capa anterior
    if (this.sargazoLayer) {
      this.sargazoLayer.clearLayers();
    } else {
      this.sargazoLayer = L.layerGroup().addTo(this.map);
    }

    // Redibujar las líneas de trayectoria usando los datos YA CARGADOS
    console.log('📍 Redibujando trayectorias con datos en memoria...');
    
    // Aplicar filtro si hay una costa seleccionada
    let filteredTrajectories = this.trajectories;
    if (this.selectedCoast) {
      filteredTrajectories = this.trajectories.filter(t => t.location === this.selectedCoast);
    }
    
    // Dibujar cada trayectoria por separado
    filteredTrajectories.forEach(trajectory => {
      const trajectoryCoords: L.LatLngExpression[] = trajectory.points.map(point => [point.latitude, point.longitude]);
      
      L.polyline(trajectoryCoords, {
        color: '#000000',
        weight: 3,
        opacity: 0.3,
        dashArray: '10, 10',
        className: 'sargazo-trajectory-line'
      }).addTo(this.sargazoLayer);
    });

    // Mostrar solo los puntos hasta el paso actual
    const visibleConcentrations = this.allConcentrations.slice(0, this.currentStep + 1);
    console.log(`🌊 Mostrando ${visibleConcentrations.length} concentraciones`);
    this.displayConcentrationPoints(visibleConcentrations);
  }

  ngOnDestroy(): void {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }
  }

  private displaySargazoTrajectories(trajectories: SargazoTrajectory[]): void {
    console.log('🎨 Dibujando trayectorias en el mapa:', trajectories.length);
    
    if (!this.sargazoLayer) {
      this.sargazoLayer = L.layerGroup().addTo(this.map);
      console.log('✅ Capa de sargazo creada');
    }

    // Dibujar cada trayectoria por separado
    trajectories.forEach((trajectory, index) => {
      const trajectoryCoords: L.LatLngExpression[] = trajectory.points.map(point => [point.latitude, point.longitude]);
      console.log(`📍 Trayectoria ${index + 1}: ${trajectoryCoords.length} puntos`);
      
      const line = L.polyline(trajectoryCoords, {
        color: '#000000',        // Negro
        weight: 3,               // Delgada
        opacity: 1,              // Completamente opaco
        dashArray: '10, 10',     // Línea cortada/punteada
        className: 'sargazo-trajectory-line'
      }).addTo(this.sargazoLayer);
      
      console.log('✅ Línea dibujada en el mapa');
    });
  }

  private displayConcentrationPoints(concentrations: SargazoConcentration[]): void {
    if (!this.sargazoLayer) {
      this.sargazoLayer = L.layerGroup().addTo(this.map);
    }

    concentrations.forEach((point, index) => {
      // Saltar puntos sin biomasa
      if (!point.area_m2 || point.area_m2 === 0) {
        console.log('⏭️ Saltando punto sin biomasa:', point);
        return;
      }

      // Verificar si es el ÚLTIMO punto (llegada a costa)
      const isLastPoint = index === concentrations.length - 1;

      // Calcular el número de puntos y el radio basado en el área
      const numPoints = this.getNumPointsByArea(point.area_m2 || 0);
      const spreadRadius = this.getSpreadRadiusByArea(point.area_m2 || 0);
      const color = this.getColorByDensity(point.density || 0);

      console.log(`🌊 Dibujando mancha: ${point.area_m2}km², ${numPoints} puntos, radio ${spreadRadius}m${isLastPoint ? ' ⚠️ LLEGADA A COSTA' : ''}`);

      // Si es el último punto, dibujar círculo de impacto costero
      if (isLastPoint) {
        this.drawCoastalImpactZone(point, spreadRadius);
      }

      // Crear múltiples capas de puntos (OPTIMIZADO: 2 capas en lugar de 3)
      for (let layer = 0; layer < 2; layer++) {
        const layerPoints = Math.floor(numPoints / (layer + 1));
        
        for (let i = 0; i < layerPoints; i++) {
          // Generar posición aleatoria alrededor del punto central
          const angle = Math.random() * 2 * Math.PI;
          const distance = Math.random() * spreadRadius * (1 - layer * 0.2);
          const offsetLat = (distance * Math.cos(angle)) / 111000;
          const offsetLng = (distance * Math.sin(angle)) / (111000 * Math.cos(point.latitude * Math.PI / 180));

          const lat = point.latitude + offsetLat;
          const lng = point.longitude + offsetLng;

          // Tamaño variable según la capa (partículas más grandes para compensar menos cantidad)
          const pointSize = (2 - layer) * (Math.random() * 6 + 6); // 6-36px (más grandes)

          // Crear punto de sargazo con efecto de mancha
          const sargazoPoint = L.circleMarker([lat, lng], {
            radius: pointSize,
            fillColor: color,
            color: this.getDarkerColor(color),
            weight: 0.8,
            fillOpacity: 0.5 + Math.random() * 0.3,
            className: 'sargazo-particle'
          }).addTo(this.sargazoLayer);

          // Agregar micro-partículas solo ocasionalmente (OPTIMIZADO: 30% en lugar de 50%)
          if (layer === 0 && Math.random() > 0.7) {
            for (let j = 0; j < 3; j++) {  // Solo 3 micro-partículas (antes: 5)
              const microAngle = Math.random() * 2 * Math.PI;
              const microDist = pointSize * 0.4;
              const microLatOffset = (microDist * Math.cos(microAngle)) / 111000;
              const microLngOffset = (microDist * Math.sin(microAngle)) / (111000 * Math.cos(point.latitude * Math.PI / 180));

              L.circleMarker([lat + microLatOffset, lng + microLngOffset], {
                radius: Math.random() * 3 + 2,
                fillColor: color,
                color: color,
                weight: 0,
                fillOpacity: 0.4 + Math.random() * 0.2,
                className: 'sargazo-micro-particle'
              }).addTo(this.sargazoLayer);
            }
          }
        }
      }

      // Agregar un círculo semi-transparente de fondo para dar sensación de área (más grande para km²)
      const backgroundCircle = L.circle([point.latitude, point.longitude], {
        radius: spreadRadius * 0.9,  // Más grande (antes: 0.8)
        fillColor: color,
        color: 'transparent',
        weight: 0,
        fillOpacity: 0.20,  // Más visible (antes: 0.15)
        className: 'sargazo-background'
      }).addTo(this.sargazoLayer);

      // Agregar un círculo invisible en el centro para el tooltip
      const tooltipMarker = L.circleMarker([point.latitude, point.longitude], {
        radius: spreadRadius / 10,
        fillColor: 'transparent',
        color: 'transparent',
        weight: 0,
        fillOpacity: 0
      });

      // Tooltip con información detallada
      const tooltipContent = `
        <div class="text-xs">
          <strong>Concentración de Sargazo</strong><br>
          <span class="font-semibold">Área: ${point.area_m2 || 0} km²</span><br>
          Densidad: ${point.density || 0}%<br>
          Nivel: <span class="font-semibold">${this.getIntensityLabel(point.intensity)}</span>
        </div>
      `;

      tooltipMarker.bindTooltip(tooltipContent, {
        permanent: false,
        direction: 'top',
        className: 'custom-tooltip'
      });

      tooltipMarker.addTo(this.sargazoLayer);
    });
  }

  private getNumPointsByArea(area_m2: number): number {
    // Optimizado: Menos partículas pero bien distribuidas
    // Ajustado para valores reales de biomasa en km² (10-40 km²)
    if (area_m2 === 0) return 10;
    if (area_m2 < 15) return 80;    // Antes: 200
    if (area_m2 < 25) return 150;   // Antes: 400
    if (area_m2 < 30) return 220;   // Antes: 600
    if (area_m2 < 35) return 300;   // Antes: 800
    return 400;                      // Antes: 1000
  }

  private getSpreadRadiusByArea(area_m2: number): number {
    // Manchas MUCHO más grandes (radio de dispersión en metros)
    // Ajustado para valores reales de biomasa en km² (10-40 km²)
    // 1 km² ≈ 564 metros de radio (aproximadamente)
    if (area_m2 === 0) return 100;
    if (area_m2 < 15) return 2000;   // ~2 km de radio - Antes: 50m
    if (area_m2 < 25) return 2800;   // ~2.8 km de radio - Antes: 80m
    if (area_m2 < 30) return 3200;   // ~3.2 km de radio - Antes: 110m
    if (area_m2 < 35) return 3600;   // ~3.6 km de radio - Antes: 140m
    return 4000;                      // ~4 km de radio - Antes: 170m
  }

  private getColorByDensity(density: number): string {
    // Colores más realistas de sargazo (marrón-verde oliva)
    if (density < 40) return '#9B8F6B'; // Marrón verdoso claro
    if (density < 60) return '#7A6E4E'; // Marrón verdoso
    if (density < 80) return '#5C5039'; // Marrón oscuro
    return '#3E3526'; // Marrón muy oscuro
  }

  private getDarkerColor(color: string): string {
    // Oscurecer el color para el borde
    const hex = color.replace('#', '');
    const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - 30);
    const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - 30);
    const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - 30);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  private getIntensityLabel(intensity?: string): string {
    switch(intensity) {
      case 'high': return 'Alto';
      case 'medium': return 'Medio';
      case 'low': return 'Bajo';
      default: return 'Desconocido';
    }
  }

  private displaySargazoConcentrations(concentrations: SargazoPoint[]): void {
    concentrations.forEach(point => {
      const color = this.getColorByIntensity(point.intensity);
      const size = this.getSizeByIntensity(point.intensity) + 4;

      // Marcador pulsante para concentraciones actuales
      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: size,
        fillColor: color,
        color: color,
        weight: 4,
        fillOpacity: 0.6,
        className: 'sargazo-pulse'
      });

      const tooltipContent = `
        <div class="text-xs">
          <strong>Concentración Actual</strong><br>
          Intensidad: <span class="font-semibold text-${point.intensity === 'high' ? 'red' : point.intensity === 'medium' ? 'amber' : 'teal'}-600">
            ${point.intensity === 'high' ? 'Alta' : point.intensity === 'medium' ? 'Media' : 'Baja'}
          </span><br>
          Lat: ${point.latitude.toFixed(4)}, Lng: ${point.longitude.toFixed(4)}
        </div>
      `;

      marker.bindTooltip(tooltipContent, { 
        permanent: false,
        direction: 'top',
        className: 'custom-tooltip'
      });

      marker.addTo(this.sargazoLayer);
    });
  }

  private getColorByIntensity(intensity?: string): string {
    switch(intensity) {
      case 'high': return '#ef4444'; // rojo
      case 'medium': return '#f59e0b'; // ámbar
      case 'low': return '#14b8a6'; // teal
      default: return '#6b7280'; // gris
    }
  }

  private getSizeByIntensity(intensity?: string): number {
    switch(intensity) {
      case 'high': return 8;
      case 'medium': return 6;
      case 'low': return 4;
      default: return 3;
    }
  }

  private drawCoastalImpactZone(point: SargazoConcentration, baseRadius: number): void {
    // Radio de impacto costero SUPER AMPLIO (10x el tamaño de la mancha para cubrir más costas)
    const impactRadius = baseRadius * 10; // AUMENTADO de 3x a 10x para abarcar más área
    
    console.log(`🚨🚨🚨 ZONA DE IMPACTO COSTERO - Punto: (${point.latitude}, ${point.longitude}), Radio: ${impactRadius}m (${(impactRadius/1000).toFixed(1)}km)`);
    
    // Círculo de impacto GRANDE con color rojo/naranja de advertencia
    const impactCircle = L.circle([point.latitude, point.longitude], {
      radius: impactRadius,
      fillColor: '#ef4444',  // Rojo
      color: '#dc2626',       // Rojo oscuro
      weight: 4,              // Borde más grueso (antes: 3)
      fillOpacity: 0.20,      // Más visible (antes: 0.15)
      opacity: 1,             // Borde completamente opaco (antes: 0.8)
      dashArray: '15, 10',    // Línea punteada más larga (antes: 10, 10)
      className: 'coastal-impact-zone'
    }).addTo(this.sargazoLayer);

    // Detectar costas afectadas
    const affectedCoasts = this.getAffectedCoasts(point.latitude, point.longitude, impactRadius);
    
    console.log(`⚠️ Costas afectadas:`, affectedCoasts);

    // Crear tooltip con información de costas afectadas
    const coastsList = affectedCoasts.length > 0 
      ? affectedCoasts.map(coast => `<li class="text-xs">• ${coast}</li>`).join('')
      : '<li class="text-xs text-gray-500">• Océano abierto</li>';

    const tooltipContent = `
      <div class="text-xs">
        <strong class="text-red-600">⚠️ LLEGADA A COSTA</strong><br>
        <span class="font-semibold">Área de impacto: ${point.area_m2 || 0} km²</span><br>
        <span class="font-semibold">Radio de afectación: ${(impactRadius / 1000).toFixed(1)} km</span><br><br>
        <strong>Costas potencialmente afectadas:</strong>
        <ul class="mt-1 ml-2">
          ${coastsList}
        </ul>
      </div>
    `;

    impactCircle.bindTooltip(tooltipContent, {
      permanent: false,
      direction: 'top',
      className: 'custom-tooltip'
    });

    // Marcador central de llegada MÁS GRANDE Y VISIBLE
    const arrivalMarker = L.circleMarker([point.latitude, point.longitude], {
      radius: 20,              // Más grande (antes: 12)
      fillColor: '#ef4444',    // Rojo
      color: '#ffffff',        // Borde blanco
      weight: 5,               // Borde más grueso (antes: 3)
      fillOpacity: 1,          // Completamente opaco (antes: 0.9)
      className: 'arrival-marker pulsating'  // Añadir clase para animación
    }).addTo(this.sargazoLayer);

    arrivalMarker.bindTooltip('🏖️ LLEGADA A COSTA', {
      permanent: true,
      direction: 'top',
      className: 'arrival-tooltip',
      offset: [0, -25]  // Más arriba del marcador
    });

    // NO DIBUJAR MARCADORES DE COSTAS - SOLO EL CÍRCULO ROJO
    // this.drawAffectedCoastMarkers(point.latitude, point.longitude, impactRadius);
  }

  private drawAffectedCoastMarkers(lat: number, lng: number, radiusMeters: number): void {
    console.log(`🔍 Buscando costas afectadas cerca de lat: ${lat}, lng: ${lng}, radio: ${radiusMeters}m (${(radiusMeters/1000).toFixed(1)}km)`);
    
    // Base de datos de costas de Yucatán y Quintana Roo con sus coordenadas
    const coasts = [
      // Yucatán
      { name: 'Progreso', state: 'Yucatán', lat: 21.2817, lng: -89.6650 },
      { name: 'Telchac Puerto', state: 'Yucatán', lat: 21.3383, lng: -89.2667 },
      { name: 'Dzilam de Bravo', state: 'Yucatán', lat: 21.3833, lng: -88.9000 },
      { name: 'San Felipe', state: 'Yucatán', lat: 21.5667, lng: -88.2500 },
      { name: 'Río Lagartos', state: 'Yucatán', lat: 21.6000, lng: -88.1500 },
      { name: 'Las Coloradas', state: 'Yucatán', lat: 21.5667, lng: -87.9667 },
      
      // Quintana Roo (Norte)
      { name: 'Holbox', state: 'Q. Roo', lat: 21.5211, lng: -87.3764 },
      { name: 'Chiquilá', state: 'Q. Roo', lat: 21.4250, lng: -87.3333 },
      { name: 'Cancún', state: 'Q. Roo', lat: 21.1619, lng: -86.8515 },
      { name: 'Puerto Morelos', state: 'Q. Roo', lat: 20.8508, lng: -86.8739 },
      { name: 'Playa del Carmen', state: 'Q. Roo', lat: 20.6296, lng: -87.0739 },
      { name: 'Puerto Aventuras', state: 'Q. Roo', lat: 20.5000, lng: -87.2333 },
      { name: 'Akumal', state: 'Q. Roo', lat: 20.3953, lng: -87.3153 },
      { name: 'Tulum', state: 'Q. Roo', lat: 20.2114, lng: -87.4654 },
      
      // Quintana Roo (Sur)
      { name: 'Sian Ka\'an', state: 'Q. Roo', lat: 19.8667, lng: -87.5333 },
      { name: 'Mahahual', state: 'Q. Roo', lat: 18.7097, lng: -87.7089 },
      { name: 'Xcalak', state: 'Q. Roo', lat: 18.2667, lng: -87.8333 },
      { name: 'Chetumal', state: 'Q. Roo', lat: 18.5001, lng: -88.2962 }
    ];

    const radiusKm = radiusMeters / 1000;
    let affectedCount = 0;

    console.log(`🔍 Verificando ${coasts.length} costas contra radio de ${radiusKm.toFixed(1)}km...`);

    coasts.forEach(coast => {
      // Calcular distancia usando fórmula de Haversine
      const distance = this.calculateDistance(lat, lng, coast.lat, coast.lng);
      
      console.log(`  📏 ${coast.name}: ${distance.toFixed(1)}km ${distance <= radiusKm ? '✅ AFECTADA' : '⚪ Fuera de rango'}`);
      
      if (distance <= radiusKm) {
        affectedCount++;
        
        console.log(`  🔴 Dibujando marcador GRANDE en ${coast.name} (${coast.lat}, ${coast.lng})`);
        
        // ✅ MARCADOR ROJO MUY GRANDE EN LA COSTA AFECTADA
        const coastMarker = L.circleMarker([coast.lat, coast.lng], {
          radius: 15,              // MÁS GRANDE (antes: 10)
          fillColor: '#dc2626',    // Rojo oscuro
          color: '#ffffff',        // Borde blanco
          weight: 4,               // Borde más grueso
          fillOpacity: 1,          // Completamente opaco
          className: 'affected-coast-marker pulsating'  // Animación de pulso
        }).addTo(this.sargazoLayer);

        // Tooltip con información de la costa
        const tooltipContent = `
          <div class="text-xs">
            <strong class="text-red-600">⚠️ COSTA AFECTADA</strong><br>
            <span class="font-semibold">${coast.name}</span><br>
            <span class="text-gray-600">${coast.state}</span><br>
            <span class="text-red-600">Distancia: ${distance.toFixed(1)} km</span>
          </div>
        `;

        coastMarker.bindTooltip(tooltipContent, {
          permanent: false,
          direction: 'top',
          className: 'custom-tooltip'
        });

        // ✅ ETIQUETA PERMANENTE MUY VISIBLE con el nombre de la costa
        const label = L.marker([coast.lat, coast.lng], {
          icon: L.divIcon({
            className: 'coast-label',
            html: `<div style="background: #dc2626; color: white; font-size: 11px; padding: 4px 8px; border-radius: 4px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 2px solid white; white-space: nowrap;">
                     ⚠️ ${coast.name}
                   </div>`,
            iconSize: [120, 24],
            iconAnchor: [60, 35]
          })
        }).addTo(this.sargazoLayer);

        // ✅ FLECHA ROJA GRUESA conectando el punto de impacto con la costa afectada
        const connectionLine = L.polyline(
          [[lat, lng], [coast.lat, coast.lng]],
          {
            color: '#dc2626',       // Rojo oscuro
            weight: 4,              // MÁS GRUESA (antes: 2)
            opacity: 0.8,           // Más opaca (antes: 0.6)
            dashArray: '10, 10',    // Patrón de línea discontinua
            className: 'impact-connection-line'
          }
        ).addTo(this.sargazoLayer);
        
        // ✅ DIBUJAR FLECHA al final de la línea (triángulo apuntando a la costa)
        const arrowSize = 0.015; // Tamaño de la flecha en grados (más pequeño en mapa)
        const angle = Math.atan2(coast.lat - lat, coast.lng - lng);
        
        // Crear triángulo de flecha
        const arrowTip: [number, number] = [coast.lat, coast.lng];
        const arrowLeft: [number, number] = [
          coast.lat - arrowSize * Math.sin(angle - Math.PI / 6),
          coast.lng - arrowSize * Math.cos(angle - Math.PI / 6)
        ];
        const arrowRight: [number, number] = [
          coast.lat - arrowSize * Math.sin(angle + Math.PI / 6),
          coast.lng - arrowSize * Math.cos(angle + Math.PI / 6)
        ];
        
        // Dibujar la flecha como polígono
        L.polygon([arrowTip, arrowLeft, arrowRight], {
          color: '#dc2626',
          fillColor: '#dc2626',
          fillOpacity: 1,
          weight: 2
        }).addTo(this.sargazoLayer);
      }
    });

    console.log(`🏖️ ${affectedCount} costas marcadas en ROJO en el mapa`);
  }

  private getAffectedCoasts(lat: number, lng: number, radiusMeters: number): string[] {
    // Base de datos de costas de Yucatán y Quintana Roo con sus coordenadas
    const coasts = [
      // Yucatán
      { name: 'Progreso, Yucatán', lat: 21.2817, lng: -89.6650 },
      { name: 'Telchac Puerto, Yucatán', lat: 21.3383, lng: -89.2667 },
      { name: 'Dzilam de Bravo, Yucatán', lat: 21.3833, lng: -88.9000 },
      { name: 'San Felipe, Yucatán', lat: 21.5667, lng: -88.2500 },
      { name: 'Río Lagartos, Yucatán', lat: 21.6000, lng: -88.1500 },
      { name: 'Las Coloradas, Yucatán', lat: 21.5667, lng: -87.9667 },
      
      // Quintana Roo (Norte)
      { name: 'Holbox, Quintana Roo', lat: 21.5211, lng: -87.3764 },
      { name: 'Chiquilá, Quintana Roo', lat: 21.4250, lng: -87.3333 },
      { name: 'Cancún (Zona Hotelera), Quintana Roo', lat: 21.1619, lng: -86.8515 },
      { name: 'Puerto Morelos, Quintana Roo', lat: 20.8508, lng: -86.8739 },
      { name: 'Playa del Carmen, Quintana Roo', lat: 20.6296, lng: -87.0739 },
      { name: 'Puerto Aventuras, Quintana Roo', lat: 20.5000, lng: -87.2333 },
      { name: 'Akumal, Quintana Roo', lat: 20.3953, lng: -87.3153 },
      { name: 'Tulum, Quintana Roo', lat: 20.2114, lng: -87.4654 },
      
      // Quintana Roo (Sur)
      { name: 'Sian Ka\'an, Quintana Roo', lat: 19.8667, lng: -87.5333 },
      { name: 'Mahahual, Quintana Roo', lat: 18.7097, lng: -87.7089 },
      { name: 'Xcalak, Quintana Roo', lat: 18.2667, lng: -87.8333 },
      { name: 'Chetumal, Quintana Roo', lat: 18.5001, lng: -88.2962 }
    ];

    const affectedCoasts: string[] = [];
    const radiusKm = radiusMeters / 1000;

    coasts.forEach(coast => {
      // Calcular distancia usando fórmula de Haversine
      const distance = this.calculateDistance(lat, lng, coast.lat, coast.lng);
      
      if (distance <= radiusKm) {
        affectedCoasts.push(`${coast.name} (${distance.toFixed(1)} km)`);
      }
    });

    return affectedCoasts;
  }

  /**
   * Calcula las estadísticas basadas en los datos reales de la API
   */
  private calculateStatistics(): void {
    console.log('📊 Calculando estadísticas desde datos de API...');
    
    if (!this.allConcentrations || this.allConcentrations.length === 0) {
      console.log('⚠️ No hay concentraciones disponibles para calcular estadísticas');
      return;
    }

    // Base de datos de costas (mismo que en drawAffectedCoastMarkers)
    const coasts = [
      { name: 'Progreso', state: 'Yucatán', lat: 21.2817, lng: -89.6650 },
      { name: 'Telchac Puerto', state: 'Yucatán', lat: 21.3383, lng: -89.2667 },
      { name: 'Dzilam de Bravo', state: 'Yucatán', lat: 21.3833, lng: -88.9000 },
      { name: 'San Felipe', state: 'Yucatán', lat: 21.5667, lng: -88.2500 },
      { name: 'Río Lagartos', state: 'Yucatán', lat: 21.6000, lng: -88.1500 },
      { name: 'Las Coloradas', state: 'Yucatán', lat: 21.5667, lng: -87.9667 },
      { name: 'Holbox', state: 'Q. Roo', lat: 21.5211, lng: -87.3764 },
      { name: 'Chiquilá', state: 'Q. Roo', lat: 21.4250, lng: -87.3333 },
      { name: 'Cancún', state: 'Q. Roo', lat: 21.1619, lng: -86.8515 },
      { name: 'Puerto Morelos', state: 'Q. Roo', lat: 20.8508, lng: -86.8739 },
      { name: 'Playa del Carmen', state: 'Q. Roo', lat: 20.6296, lng: -87.0739 },
      { name: 'Puerto Aventuras', state: 'Q. Roo', lat: 20.5000, lng: -87.2333 },
      { name: 'Akumal', state: 'Q. Roo', lat: 20.3953, lng: -87.3153 },
      { name: 'Tulum', state: 'Q. Roo', lat: 20.2114, lng: -87.4654 },
      { name: 'Sian Ka\'an', state: 'Q. Roo', lat: 19.8667, lng: -87.5333 },
      { name: 'Mahahual', state: 'Q. Roo', lat: 18.7097, lng: -87.7089 },
      { name: 'Xcalak', state: 'Q. Roo', lat: 18.2667, lng: -87.8333 },
      { name: 'Chetumal', state: 'Q. Roo', lat: 18.5001, lng: -88.2962 }
    ];

    // 1. Calcular biomasa total en km²
    this.totalBiomassKm2 = this.allConcentrations.reduce((sum, c) => sum + (c.area_m2 || 0), 0);
    
    // 2. Encontrar el ÚLTIMO punto (punto de llegada a costa - debería estar cerca de las costas)
    const lastPoint = this.allConcentrations[this.allConcentrations.length - 1];
    
    console.log('🎯 VERIFICACIÓN DE PUNTO DE LLEGADA:');
    console.log('   - Índice usado:', this.allConcentrations.length - 1);
    console.log('   - Total de puntos:', this.allConcentrations.length);
    console.log('   - Latitud:', lastPoint.latitude);
    console.log('   - Longitud:', lastPoint.longitude);
    console.log('   - Biomasa:', lastPoint.area_m2, 'km²');
    console.log('   - Primer punto (océano):', this.allConcentrations[0].latitude, this.allConcentrations[0].longitude, this.allConcentrations[0].area_m2 + 'km²');
    console.log('   - Último punto (costa):', lastPoint.latitude, lastPoint.longitude, lastPoint.area_m2 + 'km²');
    
    // 3. Contar SOLO las costas que están CERCA del punto de llegada (radio de 100 km)
    const RADIO_CERCANIA_KM = 100; // Radio para considerar una costa "cercana"
    
    const coastsWithDistance = coasts.map(coast => {
      const distance = this.calculateDistance(lastPoint.latitude, lastPoint.longitude, coast.lat, coast.lng);
      return {
        name: coast.name,
        state: coast.state,
        distance: distance,
        isNearby: distance <= RADIO_CERCANIA_KM, // Está dentro del radio de impacto
        // Asignar biomasa proporcional a la distancia (más cerca = más afectada)
        biomassKm2: Math.max(0, lastPoint.area_m2 || 0) * (1 - distance / 200),
        density: Math.max(30, Math.min(95, 100 - distance))
      };
    });
    
    // Contar SOLO las costas cercanas como "zonas de alto riesgo"
    this.highRiskZones = coastsWithDistance.filter(c => c.isNearby).length;
    
    console.log(`🎯 Punto de llegada: (${lastPoint.latitude.toFixed(4)}, ${lastPoint.longitude.toFixed(4)})`);
    console.log(`📏 Radio de cercanía: ${RADIO_CERCANIA_KM} km`);
    console.log(`📍 Distancias calculadas a cada costa:`);
    coastsWithDistance.forEach(c => {
      console.log(`   ${c.isNearby ? '✅' : '⚪'} ${c.name}: ${c.distance.toFixed(1)} km`);
    });
    console.log(`⚠️ Total de costas en zona de riesgo: ${this.highRiskZones}`);

    // Ordenar por distancia (más cercanas primero)
    coastsWithDistance.sort((a, b) => a.distance - b.distance);
    
    // Tomar las 4 más cercanas y asignar nivel de riesgo basado en distancia
    this.topAffectedZones = coastsWithDistance.slice(0, 4).map(coast => {
      // Nivel de riesgo basado en DISTANCIA (no densidad)
      let riskLevel = 'Bajo';
      if (coast.distance < 30) riskLevel = 'Alto';        // Menos de 30 km
      else if (coast.distance < 60) riskLevel = 'Medio';  // Entre 30-60 km
      else riskLevel = 'Bajo';                             // Más de 60 km
      
      return {
        name: coast.name,
        biomassKm2: parseFloat(Math.max(0, coast.biomassKm2).toFixed(2)),
        density: Math.round(coast.density),
        riskLevel: riskLevel
      };
    });

    // 4. Contar total de costas monitoreadas
    this.totalAffectedCoasts = coasts.length;

    console.log('✅ Estadísticas calculadas:');
    console.log('   - Biomasa total:', this.totalBiomassKm2.toFixed(2), 'km²');
    console.log('   - Zonas de alto riesgo:', this.highRiskZones);
    console.log('   - Costas monitoreadas:', this.totalAffectedCoasts);
    console.log('   - Top 4 zonas afectadas:', this.topAffectedZones);
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Fórmula de Haversine para calcular distancia entre dos puntos en km
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private initMap(): void {
    // Centro aproximado de la península de Yucatán
    const yucatanCenter: L.LatLngExpression = [20.8, -88.0];

    console.log('🗺️ Creando mapa Leaflet...');
    
    // Inicializar mapa
    this.map = L.map('map', { zoomControl: false }).setView(yucatanCenter, 7);

    // Capa base con estilo oceánico (OpenStreetMap como alternativa más estable)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Escala métrica discreta
    L.control.scale({ imperial: false, metric: true }).addTo(this.map);

    // Controles minimalistas (zoom abajo a la derecha)
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    
    console.log('✅ Mapa inicializado correctamente');
    
    // Forzar el recalculo del tamaño del mapa después de inicializar
    setTimeout(() => {
      this.map.invalidateSize(true);
      console.log('✅ Tamaño del mapa ajustado');
    }, 100);
  }
}
