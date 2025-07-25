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

        console.log(`📅 Chargement photos pour ${periodName} - Version simplifiée`);

        // Conversion en nombres pour la comparaison
        const targetYear = parseInt(year, 10);
        const targetMonth = month ? parseInt(month, 10) : null;

        console.log(`🎯 Recherche: année ${targetYear}, mois ${targetMonth}`);

        let allPhotos = [];
        let page = 1;
        let hasMore = true;
        let totalTested = 0;

        // Boucle identique à ton test qui marche
        while (hasMore && page <= 30) {
            try {
                console.log(`🔍 Page ${page}...`);

                // Recherche EXACTEMENT comme dans ton test
                const result = await this.searchPhotos({
                    page,
                    size: 1000,
                    query: '' // Pas de terme, comme dans ton test
                });

                if (result.photos.length === 0) {
                    console.log(`Fin des photos à la page ${page}`);
                    hasMore = false;
                    break;
                }

                totalTested += result.photos.length;

                // Filtrage EXACTEMENT comme dans ton test
                const periodPhotos = result.photos.filter(photo => {
                    try {
                        const photoDate = new Date(photo.fileCreatedAt || photo.localDateTime);

                        if (isNaN(photoDate.getTime())) {
                            return false;
                        }

                        const photoYear = photoDate.getFullYear();
                        const photoMonth = photoDate.getMonth() + 1; // 1-12, comme dans ton test

                        // Debug pour mai 2021 spécifiquement
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
                } else {
                    console.log(`Page ${page}: 0 photos de ${periodName} sur ${result.photos.length} photos`);
                }

                // Callback de progression
                if (onProgress) {
                    onProgress({
                        page,
                        photosThisPage: periodPhotos.length,
                        allPhotosThisPage: result.photos.length,
                        totalFound: allPhotos.length,
                        totalTested,
                        period: periodName,
                        expectedTotal: 'inconnu'
                    });
                }

                page++;
                hasMore = result.hasMore;

                // Petite pause pour éviter de surcharger l'API
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


    async ZloadPhotosForPeriod(period, onProgress = null) {
        const { year, month } = period;
        const periodName = month ? `${year}-${month}` : year;

        console.log(`📅 Chargement photos pour ${periodName} via TIMELINE`);

        // Étape 1: Trouver les buckets correspondants
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
        console.log('Buckets détail:', targetBuckets);

        // Étape 2: NOUVELLE APPROCHE - Utiliser l'endpoint timeline directement
        let allPhotos = [];

        try {
            // Construire les paramètres pour l'endpoint timeline
            for (const bucket of targetBuckets) {
                console.log(`📅 Chargement bucket: ${bucket.timeBucket} (${bucket.count} photos)`);

                // Utiliser l'endpoint timeline/bucket pour ce bucket spécifique
                const bucketPhotos = await this.getTimelineBucket(bucket.timeBucket, bucket.count);

                if (bucketPhotos && bucketPhotos.length > 0) {
                    console.log(`✅ ${bucketPhotos.length} photos récupérées pour ${bucket.timeBucket}`);
                    allPhotos = allPhotos.concat(bucketPhotos);

                    if (onProgress) {
                        onProgress({
                            bucket: bucket.timeBucket,
                            photosThisBucket: bucketPhotos.length,
                            totalFound: allPhotos.length,
                            period: periodName,
                            expectedTotal
                        });
                    }
                }

                // Pause entre buckets
                await this.delay(this.requestDelay);
            }

        } catch (error) {
            console.error('Erreur chargement via timeline:', error);

            // FALLBACK: Méthode search avec filtrage strict
            console.log('🔄 Fallback vers méthode search...');
            allPhotos = await this.loadPhotosViaSearchFallback(period, onProgress);
        }

        // Trier par date (plus récentes en premier)
        allPhotos.sort((a, b) => new Date(b.fileCreatedAt) - new Date(a.fileCreatedAt));

        console.log(`✅ ${allPhotos.length} photos chargées pour ${periodName} (attendu: ${expectedTotal})`);
        return allPhotos;
    }

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

    async yloadPhotosForPeriod(period, onProgress = null) {
        const { year, month } = period;
        const periodName = month ? `${year}-${month}` : year;

        console.log(`📅 Chargement photos pour ${periodName}`);

        // Étape 1: Trouver les buckets correspondant à la période
        const timeBuckets = await this.getTimeBuckets();
        let targetBuckets = [];

        if (month) {
            // Mois spécifique - FIX: formater correctement le mois
            const targetBucket = `${year}-${month.padStart(2, '0')}`;
            targetBuckets = timeBuckets.filter(bucket =>
                bucket.timeBucket.startsWith(targetBucket)
            );
            console.log(`Recherche buckets pour ${targetBucket}:`, targetBuckets);
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

        // Étape 2: Charger les photos avec une approche plus robuste
        let allPhotos = [];
        let page = 1;
        let hasMore = true;
        let consecutiveEmptyPages = 0;

        while (hasMore && page <= 50 && consecutiveEmptyPages < 3) { // Augmenter limite et ajouter sécurité
            try {
                const result = await this.searchPhotos({ page, size: 1000 }); // Augmenter taille

                if (result.photos.length === 0) {
                    consecutiveEmptyPages++;
                    hasMore = false;
                    break;
                }

                consecutiveEmptyPages = 0; // Reset si on trouve des photos

                // Filtrage CORRIGÉ avec debug amélioré
                const periodPhotos = result.photos.filter(photo => {
                    try {
                        const photoDate = new Date(photo.fileCreatedAt || photo.localDateTime);

                        // FIX: Validation de date plus robuste
                        if (isNaN(photoDate.getTime())) {
                            console.warn(`Date invalide pour photo ${photo.id}:`, photo.fileCreatedAt, photo.localDateTime);
                            return false;
                        }

                        const photoYear = photoDate.getFullYear();
                        const photoMonth = photoDate.getMonth() + 1; // 1-12

                        // FIX: Comparaison numérique au lieu de string
                        const targetYear = parseInt(year, 10);
                        const targetMonth = month ? parseInt(month, 10) : null;

                        // Debug spécial pour mai 2021
                        if (targetYear === 2021 && targetMonth === 5) {
                            console.log(`Debug mai 2021 - Photo ${photo.filename}:`, {
                                fileCreatedAt: photo.fileCreatedAt,
                                localDateTime: photo.localDateTime,
                                parsedDate: photoDate.toISOString(),
                                photoYear,
                                photoMonth,
                                targetYear,
                                targetMonth,
                                yearMatch: photoYear === targetYear,
                                monthMatch: photoMonth === targetMonth
                            });
                        }

                        // Vérifier l'année
                        if (photoYear !== targetYear) return false;

                        // Si mois spécifié, vérifier aussi le mois
                        if (targetMonth !== null) {
                            const matches = photoMonth === targetMonth;
                            return matches;
                        }

                        return true;

                    } catch (error) {
                        console.warn(`Erreur filtrage photo ${photo.id}:`, error);
                        return false;
                    }
                });

                // FIX: Messages de progression plus informatifs
                const periodPhotosCount = periodPhotos.length;
                const allPhotosFromAPI = result.photos.length;

                if (periodPhotosCount > 0) {
                    allPhotos = allPhotos.concat(periodPhotos);
                }

                if (onProgress) {
                    onProgress({
                        page,
                        photosThisPage: periodPhotosCount, // Photos de la période sur cette page
                        allPhotosThisPage: allPhotosFromAPI, // Toutes les photos de cette page
                        totalFound: allPhotos.length,
                        period: periodName,
                        expectedTotal
                    });
                }

                // Message de debug plus clair
                console.log(`Page ${page}: ${periodPhotosCount}/${allPhotosFromAPI} photos de ${periodName} (Total période: ${allPhotos.length})`);

                page++;
                hasMore = result.hasMore;

                // Optimisation : arrêter si on a assez de photos
                if (allPhotos.length >= expectedTotal && expectedTotal > 0) {
                    console.log(`✅ Quota atteint: ${allPhotos.length}/${expectedTotal}`);
                    break;
                }

                // Pause entre pages
                await this.delay(this.requestDelay);

            } catch (error) {
                console.error(`Erreur page ${page}:`, error);
                consecutiveEmptyPages++;
                if (consecutiveEmptyPages >= 3) {
                    console.warn('Trop d\'erreurs consécutives, arrêt du chargement');
                    break;
                }
            }
        }

        // Trier par date (plus récentes en premier)
        allPhotos.sort((a, b) => new Date(b.fileCreatedAt) - new Date(a.fileCreatedAt));

        console.log(`✅ ${allPhotos.length} photos chargées pour ${periodName} (attendu: ${expectedTotal})`);

        // Debug final pour mai 2021
        if (year === "2021" && month === "05") {
            console.log('=== DEBUG FINAL MAI 2021 ===');
            console.log('Photos trouvées:', allPhotos.length);
            console.log('Premiers résultats:', allPhotos.slice(0, 3).map(p => ({
                filename: p.filename,
                date: p.fileCreatedAt,
                parsed: new Date(p.fileCreatedAt).toISOString()
            })));
        }

        return allPhotos;
    }
    async XloadPhotosForPeriod(period, onProgress = null) {
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
