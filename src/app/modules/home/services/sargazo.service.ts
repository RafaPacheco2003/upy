import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface SargazoPoint {
  latitude: number;
  longitude: number;
  intensity?: 'low' | 'medium' | 'high';
  timestamp?: string;
  direction?: number; // dirección en grados
  location?: string; // identificador de la costa
}

export interface SargazoConcentration {
  latitude: number;
  longitude: number;
  area_m2?: number; // kilómetros cuadrados de sargazo (dato real de la API)
  density?: number; // densidad (0-100)
  intensity?: 'low' | 'medium' | 'high';
  location?: string; // identificador de la costa
}

export interface SargazoTrajectory {
  location: string;
  points: SargazoPoint[];
}

export interface PredictionResponse {
  predictedCoordinates: {
    latitude: number;
    longitude: number;
    sargassumBiomass: number | null; // Biomasa en kilómetros cuadrados (km²)
  }[];
  iterationsCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class SargazoService {

  private apiUrl = 'https://sargazoai-backend-production.up.railway.app/api/Coordinate/predict?iterations=15';


  constructor(
    private http: HttpClient
  ) { }

  /**
   * Obtiene las trayectorias del sargazo desde la API
   */
  getSargazoTrajectories(): Observable<SargazoTrajectory[]> {
    console.log('🌐 [SERVICE] Iniciando petición GET a:', this.apiUrl);
    const headers = new HttpHeaders({
      'ngrok-skip-browser-warning': 'true'
    });

    return this.http.get<PredictionResponse>(this.apiUrl, { headers }).pipe(
      map(response => {
        console.log('✅ [SERVICE] Respuesta completa de la API:', response);
        console.log('✅ [SERVICE] Número de coordenadas:', response.predictedCoordinates.length);
        console.log('✅ [SERVICE] Iteraciones:', response.iterationsCount);
        
        // INVERTIR TODO: coordenadas + biomasa (del final al inicio)
        const coordinates = [...response.predictedCoordinates].reverse();
        console.log('🔄 [SERVICE] TODO invertido (coordenadas + biomasa)');
        console.log('📊 [SERVICE] Primer punto invertido (ahora océano):', coordinates[0]);
        console.log('📊 [SERVICE] Último punto invertido (ahora costa):', coordinates[coordinates.length - 1]);
        
        // Convertir las coordenadas predichas en puntos de trayectoria
        const points: SargazoPoint[] = coordinates.map(coord => ({
          latitude: coord.latitude,
          longitude: coord.longitude,
          location: 'sargazo-prediction'
        }));

        console.log(`✅ [SERVICE] ${points.length} puntos de trayectoria generados (INVERTIDOS)`);

        return [{
          location: 'sargazo-prediction',
          points: points
        }];
      }),
      catchError(error => {
        console.error('❌ [SERVICE] Error al obtener trayectorias:', error);
        console.error('❌ [SERVICE] Status:', error.status);
        console.error('❌ [SERVICE] Message:', error.message);
        // Retornar datos mock en caso de error
        const mockTrajectory: SargazoTrajectory[] = [{
          location: 'progreso-mock',
          points: [
            { latitude: 21.544, longitude: -89.386, location: 'progreso-mock' },
            { latitude: 21.537, longitude: -89.305, location: 'progreso-mock' },
            { latitude: 21.552, longitude: -89.236, location: 'progreso-mock' },
            { latitude: 21.576, longitude: -89.164, location: 'progreso-mock' },
            { latitude: 21.603, longitude: -89.097, location: 'progreso-mock' }
          ]
        }];
        console.log('⚠️ [SERVICE] Usando datos mock por error en API');
        return of(mockTrajectory);
      })
    );
  }

  /**
   * Obtiene la trayectoria del sargazo desde el API (LEGACY - mantener compatibilidad)
   * Por ahora usa datos mock, pero está listo para consumir tu endpoint real
   */
  getSargazoTrajectory(): Observable<SargazoPoint[]> {
    // Mantener para compatibilidad - combinar todas las trayectorias
    return this.getSargazoTrajectories().pipe(
      map(trajectories => {
        const allPoints: SargazoPoint[] = [];
        trajectories.forEach(trajectory => {
          allPoints.push(...trajectory.points);
        });
        return allPoints;
      })
    );
  }

  /**
   * Obtiene puntos de concentración de sargazo (metros cuadrados)
   * Genera concentraciones basadas en la trayectoria de la API
   */
  getSargazoConcentrationPoints(): Observable<SargazoConcentration[]> {
    console.log('🌐 [SERVICE-CONC] Iniciando petición GET a:', this.apiUrl);
    const headers = new HttpHeaders({
      'ngrok-skip-browser-warning': 'true'
    });

    return this.http.get<PredictionResponse>(this.apiUrl, { headers }).pipe(
      map(response => {
        console.log('✅ [SERVICE-CONC] Respuesta recibida');
        console.log('✅ [SERVICE-CONC] Número de coordenadas:', response.predictedCoordinates.length);
        
        // INVERTIR TODO: coordenadas + biomasa (del final al inicio)
        const coordinates = [...response.predictedCoordinates].reverse();
        console.log(`✅ [SERVICE-CONC] ${coordinates.length} coordenadas INVERTIDAS (coordenadas + biomasa)`);
        console.log('📊 [SERVICE-CONC] Primer punto invertido (ahora océano - índice 0):', coordinates[0]);
        console.log('📊 [SERVICE-CONC] Último punto invertido (ahora costa - índice ' + (coordinates.length - 1) + '):', coordinates[coordinates.length - 1]);
        
        // Usar biomasa REAL de la API (YA está invertida junto con las coordenadas)
        const concentrations: SargazoConcentration[] = coordinates.map((coord, index) => {
          // Usar sargassumBiomass real (en km²) o valor por defecto
          const area_m2 = coord.sargassumBiomass ?? 0;
          
          // Calcular densidad basada en biomasa REAL en km² (valores ~10-40 km²)
          let density: number;
          if (area_m2 === 0 || area_m2 === null) {
            density = 0;
          } else if (area_m2 < 15) {
            density = 30;
          } else if (area_m2 < 25) {
            density = 50;
          } else if (area_m2 < 30) {
            density = 65;
          } else if (area_m2 < 35) {
            density = 80;
          } else {
            density = 95;
          }
          
          // Determinar intensidad basada en densidad
          let intensity: 'low' | 'medium' | 'high';
          if (density === 0) {
            intensity = 'low';
          } else if (density < 50) {
            intensity = 'low';
          } else if (density < 75) {
            intensity = 'medium';
          } else {
            intensity = 'high';
          }

          return {
            latitude: coord.latitude,
            longitude: coord.longitude,
            area_m2: area_m2,
            density: density,
            intensity: intensity,
            location: 'sargazo-prediction'
          };
        });

        console.log(`✅ [SERVICE-CONC] ${concentrations.length} concentraciones procesadas`);
        console.log('🔍 [SERVICE-CONC] Verificación - Primera concentración:', {
          lat: concentrations[0].latitude,
          lng: concentrations[0].longitude,
          biomasa: concentrations[0].area_m2
        });
        console.log('🔍 [SERVICE-CONC] Verificación - Última concentración:', {
          lat: concentrations[concentrations.length - 1].latitude,
          lng: concentrations[concentrations.length - 1].longitude,
          biomasa: concentrations[concentrations.length - 1].area_m2
        });

        // Filtrar solo puntos con biomasa null (mantener los que tienen 0 o más)
        const validConcentrations = concentrations.filter(c => 
          c.area_m2 !== null && c.area_m2 !== undefined
        );
        console.log(`✅ [SERVICE-CONC] ${validConcentrations.length} concentraciones válidas (incluyendo biomasa 0)`);
        console.log('📊 [SERVICE-CONC] Rango de biomasa (km²):', validConcentrations.map(c => c.area_m2));

        console.log('✅ [SERVICE-CONC] RETORNANDO concentraciones válidas');
        return validConcentrations;
      }),
      catchError(error => {
        console.error('❌ [SERVICE-CONC] Error al obtener concentraciones:', error);
        console.error('❌ [SERVICE-CONC] Status:', error.status);
        console.error('❌ [SERVICE-CONC] Message:', error.message);
        // Retornar datos mock en caso de error
        const mockConcentrations: SargazoConcentration[] = [
          { latitude: 21.544, longitude: -89.386, area_m2: 500, density: 30, intensity: 'low', location: 'progreso-mock' },
          { latitude: 21.537, longitude: -89.305, area_m2: 800, density: 45, intensity: 'medium', location: 'progreso-mock' },
          { latitude: 21.552, longitude: -89.236, area_m2: 1200, density: 60, intensity: 'medium', location: 'progreso-mock' },
          { latitude: 21.576, longitude: -89.164, area_m2: 1800, density: 75, intensity: 'high', location: 'progreso-mock' },
          { latitude: 21.603, longitude: -89.097, area_m2: 2500, density: 90, intensity: 'high', location: 'progreso-mock' }
        ];
        console.log('⚠️ [SERVICE-CONC] Usando datos mock por error en API');
        return of(mockConcentrations);
      })
    );
  }

  /**
   * Obtiene puntos de concentración actual de sargazo en la costa
   */
  getCurrentSargazoConcentration(): Observable<SargazoPoint[]> {
    // No mostrar concentraciones adicionales por ahora
    const currentPoints: SargazoPoint[] = [];
    return of(currentPoints);
  }

  /**
   * Método listo para consumir tu API real
   * Descomenta y usa este método cuando tu endpoint esté disponible
   */
  /*
  fetchSargazoFromAPI(): Observable<SargazoPoint[]> {
    return this.http.get<SargazoPoint[]>(this.apiUrl);
  }
  */
}

