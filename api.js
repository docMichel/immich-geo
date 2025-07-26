/**
 * API.JS - Gestion des appels API Immich (VERSION PROPRE)
 */

class ImmichAPI {
    constructor() {
        this.baseURL = '/immich-api/api';
        this.apiKey = null;
    }

    /**
     * Configure le token d'API
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        if (apiKey) {
            localStorage.setItem('immich_api_key', apiKey);
        } else {
            localStorage.removeItem('immich_api_key');
        }
    }

    /**
     * Charge le token depuis localStorage
     */
    loadApiKey() {
        const savedKey = localStorage.getItem('immich_api_key');
        if (savedKey) {
            this.apiKey = savedKey;
            return true;
        }
        return false;
    }

    /**
     * Demande le token à l'utilisateur
     */
    async promptForApiKey() {
        const token = prompt('Entrez votre token d\'API Immich:');
        if (token && token.trim()) {
            this.setApiKey(token.trim());
            return true;
        }
        return false;
    }

    /**
     * Appel API générique
     */
    async makeRequest(endpoint, options = {}) {
        // Vérifier qu'on a un token
        if (!this.apiKey) {
            const hasToken = await this.promptForApiKey();
            if (!hasToken) {
                throw new Error('Token d\'API requis');
            }
        }

        const url = `${this.baseURL}${endpoint}`;
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey,
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                // Token invalide
                this.setApiKey(null);
                throw new Error('Token d\'API invalide');
            }
            throw new Error(`API Error ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Récupère les buckets de timeline
     */
    async getTimeBuckets() {
        return await this.makeRequest('/timeline/buckets');
    }
    /**
     * Recherche des photos avec filtrage par date optimisé
     */
    async searchPhotosByPeriod(year, month = null) {
        const allPhotos = [];
        let page = 1;
        const maxPages = 20; // Limite pour éviter les timeouts

        while (page <= maxPages) {
            try {
                const result = await this.makeRequest('/search/metadata', {
                    method: 'POST',
                    body: JSON.stringify({
                        page,
                        size: 250, // Taille raisonnable
                        query: '',
                        clip: false,
                        type: 'IMAGE'
                    })
                });

                const photos = result.assets?.items || [];

                if (photos.length === 0) {
                    break; // Plus de photos
                }

                // Filtrer par période PENDANT le chargement
                const periodPhotos = photos.filter(photo => {
                    const date = photo.fileCreatedAt || photo.localDateTime;
                    if (!date) return false;

                    const photoYear = date.substring(0, 4);
                    if (photoYear !== year) return false;

                    if (month) {
                        const photoMonth = date.substring(5, 7);
                        return photoMonth === month;
                    }

                    return true;
                });

                allPhotos.push(...periodPhotos);

                // Si on a trouvé assez de photos de la période, on peut s'arrêter
                if (periodPhotos.length > 0 && photos.length < 250) {
                    break;
                }

                page++;

                // Petit délai pour éviter de surcharger l'API
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.warn(`Erreur page ${page}:`, error);
                break;
            }
        }

        return allPhotos;
    }
    /**
     * Recherche des photos
     */
    async searchPhotos(params = {}) {
        const {
            page = 1,
            size = 1000,
            query = '',
            type = 'IMAGE'
        } = params;

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

        return {
            photos: result.assets?.items || [],
            total: result.assets?.total || 0,
            hasMore: (result.assets?.items || []).length === size
        };
    }

    /**
     * Récupère les détails d'une photo
     */
    async getPhotoDetails(photoId) {
        return await this.makeRequest(`/assets/${photoId}`);
    }

    /**
     * Test de connexion
     */
    async testConnection() {
        try {
            await this.getTimeBuckets();
            return true;
        } catch (error) {
            console.error('Test de connexion échoué:', error);
            return false;
        }
    }
}

// Instance globale unique
const api = new ImmichAPI();

// Charger le token au démarrage
api.loadApiKey();