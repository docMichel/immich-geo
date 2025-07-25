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

    /**
     * Nouvelle méthode : récupérer un bucket timeline spécifique
     * @param {string} timeBucket - Bucket (ex: "2021-05-01T00:00:00.000Z")
     * @param {number} expectedCount - Nombre attendu de photos
     * @returns {Promise<Array>} - Photos du bucket
     */
    async getTimelineBucket(timeBucket, expectedCount) {
        try {
            // Essayer différents endpoints timeline
            const endpoints = [
                `/timeline/bucket`, // Endpoint principal
                `/timeline/buckets/${encodeURIComponent(timeBucket)}`, // Endpoint spécifique
                `/assets/timeline/${encodeURIComponent(timeBucket)}` // Endpoint alternatif
            ];

            for (const endpoint of endpoints) {
                try {
                    console.log(`🔍 Test endpoint: ${endpoint}`);

                    const response = await this.makeRequest(endpoint, {
                        method: 'POST',
                        body: JSON.stringify({
                            timeBucket: timeBucket,
                            size: expectedCount + 10 // Un peu plus pour être sûr
                        })
                    });

                    if (response && (response.length > 0 || response.assets)) {
                        const photos = response.assets || response;
                        console.log(`✅ Endpoint ${endpoint} : ${photos.length} photos`);
                        return photos;
                    }

                } catch (endpointError) {
                    console.log(`❌ Endpoint ${endpoint} failed:`, endpointError.message);
                    continue;
                }
            }

            // Si aucun endpoint timeline ne marche, utiliser la méthode search ciblée
            console.log('⚠️ Tous les endpoints timeline ont échoué, utilisation de search ciblé');
            return await this.getPhotosViaTargetedSearch(timeBucket, expectedCount);

        } catch (error) {
            console.error(`Erreur récupération bucket ${timeBucket}:`, error);
            return [];
        }
    }

    async loadPhotosForPeriod(period, onProgress = null) {
        const { year, month } = period;
        const periodName = month ? `${year}-${month}` : year;

        console.log(`📅 Chargement photos pour ${periodName} - Version corrigée`);

        // Conversion en nombres pour la comparaison
        const targetYear = parseInt(year, 10);
        const targetMonth = month ? parseInt(month, 10) : null;

        console.log(`🎯 Recherche: année ${targetYear}, mois ${targetMonth}`);

        let allPhotos = [];
        let page = 1;
        let hasMore = true;
        let totalTested = 0;

        // Recherche page par page sans terme de recherche
        while (hasMore && page <= 30) {
            try {
                console.log(`🔍 Page ${page}...`);

                const result = await this.searchPhotos({
                    page,
                    size: 1000,
                    query: '' // Pas de terme de recherche
                });

                if (result.photos.length === 0) {
                    console.log(`Fin des photos à la page ${page}`);
                    hasMore = false;
                    break;
                }

                totalTested += result.photos.length;

                // Filtrage strict par date
                const periodPhotos = result.photos.filter(photo => {
                    try {
                        const photoDate = new Date(photo.fileCreatedAt || photo.localDateTime);

                        if (isNaN(photoDate.getTime())) {
                            return false;
                        }

                        const photoYear = photoDate.getFullYear();
                        const photoMonth = photoDate.getMonth() + 1; // 1-12

                        // Debug pour mai 2021
                        if (targetYear === 2021 && targetMonth === 5 && photoYear === 2021 && photoMonth === 5) {
                            console.log(`✅ Photo mai 2021 trouvée: ${photo.originalFileName} - ${photo.fileCreatedAt}`);
                        }

                        // Comparaison exacte
                        if (targetMonth !== null) {
                            // Mois spécifique
                            return photoYear === targetYear && photoMonth === targetMonth;
                        } else {
                            // Toute l'année
                            return photoYear === targetYear;
                        }

                    } catch (error) {
                        console.warn(`Erreur parsing date pour photo ${photo.id}:`, error);
                        return false;
                    }
                });

                // Ajouter les photos trouvées
                if (periodPhotos.length > 0) {
                    allPhotos = allPhotos.concat(periodPhotos);
                    console.log(`✅ Page ${page}: ${periodPhotos.length} photos de ${periodName} (Total: ${allPhotos.length})`);
                }

                // Callback de progression
                if (onProgress) {
                    onProgress({
                        page,
                        photosThisPage: periodPhotos.length,
                        allPhotosThisPage: result.photos.length,
                        totalFound: allPhotos.length,
                        totalTested,
                        period: periodName
                    });
                }

                page++;
                hasMore = result.hasMore;

                // Petite pause
                await this.delay(50);

            } catch (error) {
                console.error(`Erreur page ${page}:`, error);
                hasMore = false;
            }
        }

        // Trier par date (plus récentes en premier)
        allPhotos.sort((a, b) => new Date(b.fileCreatedAt) - new Date(a.fileCreatedAt));

        console.log(`✅ FINAL: ${allPhotos.length} photos chargées pour ${periodName} (${totalTested} photos testées)`);

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
