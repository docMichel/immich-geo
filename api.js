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
        this.requestDelay = 100;
        this.apiKey = null; // Nouveau : stockage du token
        this.authPrompt = null; // Promesse pour éviter les multiples prompts
    }
    /**
         * Configure le token d'API
         * @param {string} apiKey - Token d'API Immich
         */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        // Sauvegarder dans localStorage pour persistance
        if (apiKey) {
            localStorage.setItem('immich_api_key', apiKey);
        } else {
            localStorage.removeItem('immich_api_key');
        }
        console.log('Token API configuré');
    }

    /**
     * Récupère le token depuis localStorage
     */
    loadApiKey() {
        const savedKey = localStorage.getItem('immich_api_key');
        if (savedKey) {
            this.apiKey = savedKey;
            console.log('Token API chargé depuis le cache');
            return true;
        }
        return false;
    }

    /**
     * Demande le token à l'utilisateur
     * @returns {Promise<boolean>} - True si token fourni
     */
    async promptForApiKey() {
        // Éviter les multiples prompts simultanés
        if (this.authPrompt) {
            return await this.authPrompt;
        }

        this.authPrompt = new Promise((resolve) => {
            const modal = this.createAuthModal(resolve);
            document.body.appendChild(modal);
        });

        const result = await this.authPrompt;
        this.authPrompt = null;
        return result;
    }


    /**
     * Crée la modal d'authentification
     * @param {Function} resolve - Callback de résolution
     * @returns {HTMLElement} - Élément modal
     */
    createAuthModal(resolve) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <h3>🔐 Authentification Immich</h3>
                <p>Veuillez entrer votre token d'API Immich pour accéder aux photos.</p>
                <div style="margin: 20px 0;">
                    <label for="apiKeyInput" style="display: block; margin-bottom: 10px; font-weight: bold;">
                        Token d'API :
                    </label>
                    <input type="password" 
                           id="apiKeyInput" 
                           placeholder="Votre token d'API Immich..."
                           style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-family: monospace;">
                </div>
                <div style="margin: 15px 0; padding: 15px; background: #f0f8ff; border-radius: 8px; font-size: 0.9rem;">
                    <strong>💡 Comment obtenir votre token :</strong><br>
                    1. Connectez-vous à votre instance Immich<br>
                    2. Allez dans <strong>Paramètres → Clés d'API</strong><br>
                    3. Cliquez sur <strong>"Nouvelle clé d'API"</strong><br>
                    4. Donnez un nom (ex: "GPS Manager") et copiez le token généré
                </div>
                <div class="modal-buttons">
                    <button id="confirmAuthBtn" class="btn btn-success">✅ Confirmer</button>
                    <button id="cancelAuthBtn" class="btn btn-secondary">❌ Annuler</button>
                </div>
            </div>
        `;

        const input = modal.querySelector('#apiKeyInput');
        const confirmBtn = modal.querySelector('#confirmAuthBtn');
        const cancelBtn = modal.querySelector('#cancelAuthBtn');

        const cleanup = () => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        };

        confirmBtn.onclick = () => {
            const token = input.value.trim();
            if (token) {
                this.setApiKey(token);
                cleanup();
                resolve(true);
            } else {
                input.style.borderColor = '#dc3545';
                input.focus();
            }
        };

        cancelBtn.onclick = () => {
            cleanup();
            resolve(false);
        };

        // Valider avec Entrée
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            }
        };

        // Focus automatique
        setTimeout(() => input.focus(), 100);

        return modal;
    }

    /**
     * Vérifie si le token est valide
     * @returns {Promise<boolean>} - True si valide
     */
    async validateApiKey() {
        if (!this.apiKey) return false;

        try {
            await this.makeRequest('/server/info');
            return true;
        } catch (error) {
            if (error.message.includes('401') || error.message.includes('403')) {
                console.warn('Token API invalide');
                this.setApiKey(null); // Supprimer le token invalide
                return false;
            }
            throw error; // Autres erreurs
        }
    }

    /**
     * S'assure qu'on a un token valide avant les requêtes
     * @returns {Promise<boolean>} - True si authentifié
     */
    async ensureAuthenticated() {
        // Charger depuis localStorage si pas encore fait
        if (!this.apiKey) {
            this.loadApiKey();
        }

        // Vérifier la validité
        if (this.apiKey && await this.validateApiKey()) {
            return true;
        }

        // Demander un nouveau token
        return await this.promptForApiKey();
    }


    /**
     * Méthode générique pour les appels API
     * @param {string} endpoint - Point de terminaison de l'API
     * @param {object} options - Options de la requête fetch
     * @returns {Promise<object>} - Réponse de l'API
     */
    async XmakeRequest(endpoint, options = {}) {
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
         * Méthode générique pour les appels API (MODIFIÉE)
         */
    async makeRequest(endpoint, options = {}) {
        // S'assurer qu'on est authentifié
        if (!endpoint.includes('/server/info')) { // Éviter la récursion pour la validation
            const isAuth = await this.ensureAuthenticated();
            if (!isAuth) {
                throw new Error('Authentification requise');
            }
        }

        try {
            const url = `${this.baseURL}${endpoint}`;
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers
            };

            // Ajouter le token d'authentification
            if (this.apiKey) {
                headers['X-API-Key'] = this.apiKey;
            }

            const response = await fetch(url, {
                headers,
                ...options
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    // Token invalide, le supprimer et redemander
                    this.setApiKey(null);
                    throw new Error(`Authentification échouée (${response.status}): Token d'API invalide`);
                }
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

    /**
    * CORRECTIONS POUR API.JS - Méthode loadPhotosForPeriod
    */

    // Dans la classe ImmichAPI, remplacer la méthode loadPhotosForPeriod par celle-ci :

    async loadPhotosForPeriod(period, onProgress = null) {
        const { year, month } = period;
        const periodName = month ? `${year}-${month.padStart(2, '0')}` : year;

        console.log(`📅 Chargement photos pour ${periodName} - Version corrigée`);

        // Conversion en nombres pour la comparaison
        const targetYear = parseInt(year, 10);
        const targetMonth = month ? parseInt(month, 10) : null;

        console.log(`🎯 Recherche: année ${targetYear}, mois ${targetMonth || 'toute l\'année'}`);

        let allPhotos = [];
        let page = 1;
        let hasMore = true;
        let totalTested = 0;
        let consecutiveEmptyPages = 0;

        // Recherche page par page sans terme de recherche
        while (hasMore && page <= 50 && consecutiveEmptyPages < 3) {
            try {
                console.log(`🔍 Page ${page}...`);

                const result = await this.searchPhotos({
                    page,
                    size: 1000,
                    query: '', // Pas de terme de recherche
                    type: 'IMAGE'
                });

                if (result.photos.length === 0) {
                    consecutiveEmptyPages++;
                    console.log(`Page ${page} vide (${consecutiveEmptyPages}/3 pages vides consécutives)`);

                    if (consecutiveEmptyPages >= 3) {
                        console.log(`Arrêt après 3 pages vides consécutives`);
                        hasMore = false;
                        break;
                    }

                    page++;
                    continue;
                }

                consecutiveEmptyPages = 0; // Reset si on trouve des photos
                totalTested += result.photos.length;

                // Filtrage strict par date avec debug amélioré
                const periodPhotos = result.photos.filter(photo => {
                    try {
                        // Essayer différents champs de date
                        const dateFields = [
                            photo.fileCreatedAt,
                            photo.localDateTime,
                            photo.createdAt,
                            photo.dateTimeOriginal
                        ];

                        let photoDate = null;
                        for (const dateField of dateFields) {
                            if (dateField) {
                                photoDate = new Date(dateField);
                                if (!isNaN(photoDate.getTime())) {
                                    break;
                                }
                            }
                        }

                        if (!photoDate || isNaN(photoDate.getTime())) {
                            console.warn(`Date invalide pour photo ${photo.id}:`, {
                                fileCreatedAt: photo.fileCreatedAt,
                                localDateTime: photo.localDateTime,
                                createdAt: photo.createdAt
                            });
                            return false;
                        }

                        const photoYear = photoDate.getFullYear();
                        const photoMonth = photoDate.getMonth() + 1; // 1-12

                        // Debug spécifique pour mai 2021
                        if (targetYear === 2021 && targetMonth === 5) {
                            if (photoYear === 2021 && photoMonth === 5) {
                                console.log(`✅ Photo mai 2021 trouvée: ${photo.originalFileName || photo.id} - ${photoDate.toISOString()}`);
                            }
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
                    // Éviter les doublons
                    const newPhotos = periodPhotos.filter(photo =>
                        !allPhotos.some(existing => existing.id === photo.id)
                    );

                    allPhotos = allPhotos.concat(newPhotos);
                    console.log(`✅ Page ${page}: ${newPhotos.length} nouvelles photos de ${periodName} (Total: ${allPhotos.length})`);
                } else {
                    console.log(`⚪ Page ${page}: 0 photos pour ${periodName} sur ${result.photos.length} photos testées`);
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

                // Petite pause pour éviter la surcharge
                await this.delay(100);

            } catch (error) {
                console.error(`Erreur page ${page}:`, error);

                // Si c'est une erreur d'authentification (401), on s'arrête
                if (error.message.includes('401')) {
                    throw new Error('Token d\'authentification invalide ou expiré');
                }

                // Pour les autres erreurs, on continue mais on limite les tentatives
                consecutiveEmptyPages++;
                if (consecutiveEmptyPages >= 3) {
                    hasMore = false;
                }
                page++;
            }
        }

        // Trier par date (plus récentes en premier)
        allPhotos.sort((a, b) => {
            const dateA = new Date(a.fileCreatedAt || a.localDateTime);
            const dateB = new Date(b.fileCreatedAt || b.localDateTime);
            return dateB - dateA;
        });

        console.log(`✅ FINAL: ${allPhotos.length} photos chargées pour ${periodName} (${totalTested} photos testées sur ${page - 1} pages)`);

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
