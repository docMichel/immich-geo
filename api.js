/**
 * API.JS - Gestion des appels API Immich
 * 
 * Ce fichier centralise toutes les interactions avec l'API Immich
 * Endpoints utilisés :
 * - /immich-api/api/timeline/buckets : périodes disponibles
 * - /immich-api/api/search/metadata : recherche de photos
 * - /immich-api/api/assets/{id} : détails d'une photo avec GPS
 * - /immich-api/api/albums : liste des albums (backup)
 */

class ImmichAPI {
    constructor() {
        this.baseURL = '/immich-api/api';
        this.requestDelay = 100; // Pause entre requêtes (ms)
    }

    /**
     * Méthode générique pour les appels API
     * @param {string} endpoint - Point de terminaison de l'API
     * @param {object} options - Options de la requête fetch
     * @returns {Promise<object>} - Réponse de l'API
     */
    async makeRequest(endpoint, options = {}) {
        try {
            const url = `${this.baseURL}${endpoint}`;
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`API Error ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Erreur API ${endpoint}:`, error);
            throw error;
        }
    }

    /**
     * Récupère les buckets de timeline (périodes disponibles)
     * @returns {Promise<Array>} - Liste des périodes avec nombre de photos
     */
    async getTimeBuckets() {
        console.log('🔄 Récupération des buckets timeline...');
        
        const buckets = await this.makeRequest('/timeline/buckets');
        
        console.log(`✅ ${buckets.length} buckets récupérés`);
        return buckets;
    }

    /**
     * Recherche des photos via l'API search/metadata
     * @param {object} params - Paramètres de recherche
     * @param {number} params.page - Numéro de page (défaut: 1)
     * @param {number} params.size - Taille de page (défaut: 1000)
     * @param {string} params.query - Terme de recherche (défaut: '')
     * @returns {Promise<object>} - Résultat avec assets.items
     */
    async searchPhotos(params = {}) {
        const {
            page = 1,
            size = 1000,
            query = '',
            type = 'IMAGE'
        } = params;

        console.log(`🔍 Recherche photos page ${page}, taille ${size}`);

        const body = {
            query,
            clip: false,
            type,
            size,
            page
        };

        const result = await this.makeRequest('/search/metadata', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        const photos = result.assets?.items || [];
        console.log(`📷 ${photos.length} photos trouvées sur la page ${page}`);
        
        return {
            photos,
            total: result.assets?.total || 0,
            hasMore: photos.length === size
        };
    }

    /**
     * Récupère les détails complets d'une photo (avec GPS)
     * @param {string} photoId - ID de la photo
     * @returns {Promise<object>} - Détails complets de la photo
     */
    async getPhotoDetails(photoId) {
        try {
            const details = await this.makeRequest(`/assets/${photoId}`);
            return details;
        } catch (error) {
            console.warn(`⚠️ Impossible de récupérer les détails de ${photoId}:`, error.message);
            return null;
        }
    }

    /**
     * Analyse GPS d'une liste de photos
     * @param {Array} photos - Liste des photos à analyser
     * @param {Function} onProgress - Callback de progression (optionnel)
     * @returns {Promise<Array>} - Photos avec données GPS mises à jour
     */
    async analyzePhotosGPS(photos, onProgress = null) {
        console.log(`🔍 Début analyse GPS de ${photos.length} photos`);
        
        let analyzed = 0;
        let foundGPS = 0;
        
        for (const photo of photos) {
            // Ignorer si déjà analysé
            if (photo.analyzed) {
                analyzed++;
                continue;
            }

            try {
                // Récupérer les détails complets
                const details = await this.getPhotoDetails(photo.id);
                
                photo.analyzed = true;
                
                if (details && details.exifInfo) {
                    const { exifInfo } = details;
                    
                    // Extraire les données GPS
                    if (exifInfo.latitude && exifInfo.longitude) {
                        photo.hasGPS = true;
                        photo.gpsData = {
                            latitude: parseFloat(exifInfo.latitude),
                            longitude: parseFloat(exifInfo.longitude),
                            country: exifInfo.country || 'Inconnu',
                            city: exifInfo.city || 'Inconnue',
                            altitude: exifInfo.altitude || null,
                            dateOriginal: exifInfo.dateTimeOriginal || null
                        };
                        foundGPS++;
                        
                        console.log(`📍 GPS trouvé pour ${photo.filename}: ${photo.gpsData.latitude}, ${photo.gpsData.longitude}`);
                    } else {
                        photo.hasGPS = false;
                        photo.gpsData = null;
                    }
                } else {
                    photo.hasGPS = false;
                    photo.gpsData = null;
                }
                
            } catch (error) {
                console.warn(`⚠️ Erreur analyse GPS ${photo.filename}:`, error.message);
                photo.analyzed = true;
                photo.hasGPS = false;
                photo.gpsData = null;
            }
            
            analyzed++;
            
            // Callback de progression
            if (onProgress) {
                onProgress({
                    analyzed,
                    total: photos.length,
                    foundGPS,
                    currentPhoto: photo.filename
                });
            }
            
            // Pause pour éviter la surcharge serveur
            if (analyzed % 10 === 0) {
                await this.delay(this.requestDelay);
            }
        }
        
        console.log(`✅ Analyse GPS terminée: ${foundGPS} photos avec GPS sur ${analyzed} analysées`);
        return photos;
    }

    /**
     * Charge les photos d'une période spécifique (année/mois)
     * NOUVELLE VERSION : utilise les buckets timeline + search ciblé
     * @param {object} period - Période à charger
     * @param {string} period.year - Année (ex: "2024")
     * @param {string} period.month - Mois optionnel (ex: "05")
     * @param {Function} onProgress - Callback de progression
     * @returns {Promise<Array>} - Liste des photos de la période
     */
    async loadPhotosForPeriod(period, onProgress = null) {
        const { year, month } = period;
        const periodName = month ? `${year}-${month}` : year;
        
        console.log(`📅 Chargement photos pour ${periodName}`);
        
        // Étape 1: Trouver les buckets correspondant à la période
        const timeBuckets = await this.getTimeBuckets();
        let targetBuckets = [];
        
        if (month) {
            // Mois spécifique
            const targetBucket = `${year}-${month.padStart(2, '0')}`;
            targetBuckets = timeBuckets.filter(bucket => 
                bucket.timeBucket.startsWith(targetBucket)
            );
        } else {
            // Toute l'année
            targetBuckets = timeBuckets.filter(bucket => 
                bucket.timeBucket.startsWith(year + '-')
            );
        }
        
        if (targetBuckets.length === 0) {
            console.warn(`Aucun bucket trouvé pour ${periodName}`);
            return [];
        }
        
        const expectedTotal = targetBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
        console.log(`🎯 ${targetBuckets.length} buckets trouvés, ${expectedTotal} photos attendues`);
        
        // Étape 2: Charger les photos par petits lots avec filtrage strict
        let allPhotos = [];
        let page = 1;
        let hasMore = true;
        let foundForPeriod = 0;
        
        while (hasMore && page <= 20 && foundForPeriod < expectedTotal + 100) { 
            try {
                const result = await this.searchPhotos({ page, size: 500 }); // Taille réduite
                
                if (result.photos.length === 0) {
                    hasMore = false;
                    break;
                }
                
                // Filtrage STRICT par date avec debug
                const periodPhotos = result.photos.filter(photo => {
                    try {
                        const photoDate = new Date(photo.fileCreatedAt || photo.localDateTime);
                        
                        // Debug pour comprendre le problème de mai 2021
                        if (year === "2021" && month === "05" && page === 1) {
                            console.log(`Debug photo ${photo.filename}:`, {
                                fileCreatedAt: photo.fileCreatedAt,
                                localDateTime: photo.localDateTime,
                                parsedDate: photoDate.toISOString(),
                                year: photoDate.getFullYear(),
                                month: photoDate.getMonth() + 1
                            });
                        }
                        
                        const photoYear = photoDate.getFullYear().toString();
                        
                        // Vérifier l'année
                        if (photoYear !== year) return false;
                        
                        // Si mois spécifié, vérifier aussi le mois
                        if (month) {
                            const photoMonth = (photoDate.getMonth() + 1).toString().padStart(2, '0');
                            const matches = photoMonth === month;
                            
                            // Debug supplémentaire pour mai 2021
                            if (year === "2021" && month === "05" && page <= 2) {
                                console.log(`Photo ${photo.filename}: mois calculé ${photoMonth}, recherché ${month}, match: ${matches}`);
                            }
                            
                            return matches;
                        }
                        
                        return true;
                        
                    } catch (error) {
                        console.warn(`Date invalide pour photo ${photo.id}:`, photo.fileCreatedAt, error);
                        return false;
                    }
                });
                
                allPhotos = allPhotos.concat(periodPhotos);
                foundForPeriod += periodPhotos.length;
                
                if (onProgress) {
                    onProgress({
                        page,
                        photosThisPage: periodPhotos.length,
                        totalFound: allPhotos.length,
                        period: periodName,
                        expectedTotal
                    });
                }
                
                console.log(`Page ${page}: ${periodPhotos.length}/${result.photos.length} photos pour ${periodName} (Total: ${allPhotos.length})`);
                
                page++;
                hasMore = result.hasMore;
                
                // Arrêter si on a atteint le nombre attendu
                if (foundForPeriod >= expectedTotal) {
                    console.log(`✅ Nombre attendu atteint: ${foundForPeriod}/${expectedTotal}`);
                    break;
                }
                
                // Pause entre pages
                await this.delay(this.requestDelay);
                
            } catch (error) {
                console.error(`Erreur page ${page}:`, error);
                hasMore = false;
            }
        }
        
        // Trier par date (plus récentes en premier)
        allPhotos.sort((a, b) => new Date(b.fileCreatedAt) - new Date(a.fileCreatedAt));
        
        console.log(`✅ ${allPhotos.length} photos chargées pour ${periodName} (attendu: ${expectedTotal})`);
        return allPhotos;
    }

    /**
     * Filtre les photos par période (année/mois)
     * @param {Array} photos - Photos à filtrer
     * @param {object} period - Période de filtrage
     * @returns {Array} - Photos filtrées
     */
    filterPhotosByPeriod(photos, period) {
        const { year, month } = period;
        
        return photos.filter(photo => {
            try {
                const photoDate = new Date(photo.fileCreatedAt || photo.localDateTime);
                const photoYear = photoDate.getFullYear().toString();
                
                // Vérifier l'année
                if (photoYear !== year) return false;
                
                // Si mois spécifié, vérifier aussi le mois
                if (month) {
                    const photoMonth = (photoDate.getMonth() + 1).toString().padStart(2, '0');
                    return photoMonth === month;
                }
                
                return true;
                
            } catch (error) {
                console.warn(`Date invalide pour photo ${photo.id}:`, photo.fileCreatedAt);
                return false;
            }
        });
    }

    /**
     * Récupère les albums (méthode de secours)
     * @returns {Promise<Array>} - Liste des albums
     */
    async getAlbums() {
        console.log('📁 Récupération des albums...');
        
        try {
            const albums = await this.makeRequest('/albums');
            console.log(`✅ ${albums.length} albums récupérés`);
            return albums;
        } catch (error) {
            console.warn('⚠️ Impossible de récupérer les albums:', error.message);
            return [];
        }
    }

    /**
     * Utilitaire : pause asynchrone
     * @param {number} ms - Durée en millisecondes
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test de connectivité API
     * @returns {Promise<boolean>} - True si l'API répond
     */
    async testConnection() {
        try {
            console.log('🔄 Test de connexion API...');
            await this.getTimeBuckets();
            console.log('✅ API Immich accessible');
            return true;
        } catch (error) {
            console.error('❌ API Immich inaccessible:', error.message);
            return false;
        }
    }
}

// Export de l'instance API
const immichAPI = new ImmichAPI();
