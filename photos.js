/**
 * PHOTOS.JS - Gestion des photos et filtres
 * 
 * Ce fichier gère :
 * - Le stockage et la manipulation des photos
 * - Les filtres et la pagination
 * - Le chargement par période
 * - L'analyse GPS en lot
 * - Les exports de données
 */

class PhotosManager {
    constructor() {
        this.photos = [];
        this.currentFilter = 'all';
        this.currentPage = 1;
        this.photosPerPage = 50;
        this.currentPeriod = null;
        this.isAnalyzing = false;
        this.analysisProgress = { analyzed: 0, total: 0, foundGPS: 0 };
    }

    /**
     * Récupère toutes les photos chargées
     * @returns {Array} - Liste des photos
     */
    getAllPhotos() {
        return this.photos;
    }

    /**
     * Récupère les photos filtrées
     * @returns {Array} - Photos selon le filtre actuel
     */
    getFilteredPhotos() {
        return ui.filterPhotos(this.photos, this.currentFilter);
    }

    /**
     * Récupère les photos avec GPS
     * @returns {Array} - Photos ayant des coordonnées GPS
     */
    getPhotosWithGPS() {
        return this.photos.filter(photo => photo.hasGPS && photo.gpsData);
    }

    /**
     * Récupère les photos sans GPS
     * @returns {Array} - Photos sans coordonnées GPS
     */
    getPhotosWithoutGPS() {
        return this.photos.filter(photo => photo.analyzed && !photo.hasGPS);
    }

    /**
     * Charge les photos pour une période donnée
     * @param {object} period - Période à charger {year, month}
     * @returns {Promise<Array>} - Photos chargées
     */
    async loadPhotosForPeriod(period) {
        try {
            ui.showMessage(`Chargement des photos pour ${period.year}${period.month ? '-' + period.month : ''}...`, 'info');
            ui.updateProgress(0, 'Initialisation...', true);

            // Callback de progression CORRIGÉ
            const onLoadProgress = (progress) => {
                const percent = Math.min(80, (progress.page / 15) * 80); // 80% max pour le chargement

                // FIX: Message plus informatif
                let message = `Page ${progress.page}: `;
                if (progress.photosThisPage > 0) {
                    message += `${progress.photosThisPage} photos trouvées pour ${progress.period}`;
                } else {
                    message += `${progress.allPhotosThisPage || 0} photos sur cette page, 0 pour ${progress.period}`;
                }
                message += ` (Total: ${progress.totalFound})`;

                ui.updateProgress(percent, message);
            };

            // Charger via l'API
            const loadedPhotos = await immichAPI.loadPhotosForPeriod(period, onLoadProgress);

            // Reste du code inchangé...
            this.photos = loadedPhotos.map(photo => this.createPhotoObject(photo));
            this.currentPeriod = period;
            this.currentPage = 1;

            this.updateDisplay();
            this.updateStats();

            ui.updateProgress(100, `${this.photos.length} photos chargées`, true);
            setTimeout(() => ui.updateProgress(0, '', false), 2000);

            ui.showMessage(`✅ ${this.photos.length} photos chargées pour ${this.formatPeriod(period)}`, 'success');

            return this.photos;

        } catch (error) {
            console.error('Erreur chargement photos:', error);
            ui.showMessage(`Erreur lors du chargement: ${error.message}`, 'error');
            ui.updateProgress(0, '', false);
            throw error;
        }
    }

    async XloadPhotosForPeriod(period) {
        try {
            ui.showMessage(`Chargement des photos pour ${period.year}${period.month ? '-' + period.month : ''}...`, 'info');
            ui.updateProgress(0, 'Initialisation...', true);

            // Callback de progression du chargement
            const onLoadProgress = (progress) => {
                const percent = Math.min(50, (progress.page / 10) * 50); // 50% max pour le chargement
                ui.updateProgress(
                    percent,
                    `Page ${progress.page}: ${progress.photosThisPage} photos trouvées (Total: ${progress.totalFound})`
                );
            };

            // Charger via l'API
            const loadedPhotos = await immichAPI.loadPhotosForPeriod(period, onLoadProgress);

            // Transformer en format interne
            this.photos = loadedPhotos.map(photo => this.createPhotoObject(photo));
            this.currentPeriod = period;
            this.currentPage = 1;

            // Mise à jour de l'interface
            this.updateDisplay();
            this.updateStats();

            ui.updateProgress(100, `${this.photos.length} photos chargées`, true);
            setTimeout(() => ui.updateProgress(0, '', false), 2000);

            ui.showMessage(`✅ ${this.photos.length} photos chargées pour ${this.formatPeriod(period)}`, 'success');

            return this.photos;

        } catch (error) {
            console.error('Erreur chargement photos:', error);
            ui.showMessage(`Erreur lors du chargement: ${error.message}`, 'error');
            ui.updateProgress(0, '', false);
            throw error;
        }
    }

    /**
     * Crée un objet photo standardisé
     * @param {object} rawPhoto - Données brutes de la photo
     * @returns {object} - Objet photo formaté
     */
    createPhotoObject(rawPhoto) {
        return {
            id: rawPhoto.id,
            filename: rawPhoto.originalFileName || 'Sans nom',
            fileCreatedAt: rawPhoto.fileCreatedAt || rawPhoto.localDateTime,
            thumbnailUrl: `/immich-api/api/assets/${rawPhoto.id}/thumbnail`,
            analyzed: false,
            hasGPS: false,
            gpsData: null,
            originalData: rawPhoto // Conserver les données originales
        };
    }

    /**
     * Analyse GPS de toutes les photos non analysées
     * @returns {Promise<void>}
     */
    async analyzeAllGPS() {
        if (this.isAnalyzing) {
            ui.showMessage('Une analyse GPS est déjà en cours...', 'warning');
            return;
        }

        const photosToAnalyze = this.photos.filter(photo => !photo.analyzed);

        if (photosToAnalyze.length === 0) {
            ui.showMessage('Toutes les photos ont déjà été analysées', 'info');
            return;
        }

        this.isAnalyzing = true;
        ui.toggleButton('analyzeGpsBtn', false, '🔄 Analyse en cours...');
        ui.showMessage(`Début de l'analyse GPS de ${photosToAnalyze.length} photos...`, 'info');

        try {
            // Callback de progression
            const onProgress = (progress) => {
                this.analysisProgress = progress;

                const percent = (progress.analyzed / progress.total) * 100;
                ui.updateProgress(
                    percent,
                    `${progress.foundGPS} GPS trouvés sur ${progress.analyzed}/${progress.total} photos`
                );

                // Mise à jour en temps réel des stats et affichage
                if (progress.analyzed % 10 === 0) {
                    this.updateStats();
                    this.updateDisplay();
                }
            };

            // Lancer l'analyse
            await immichAPI.analyzePhotosGPS(photosToAnalyze, onProgress);

            // Finaliser
            this.updateStats();
            this.updateDisplay();
            ui.updateProgress(0, '', false);

            const { foundGPS, total } = this.analysisProgress;
            ui.showMessage(`✅ Analyse terminée ! ${foundGPS} coordonnées GPS trouvées sur ${total} photos.`, 'success');

            // Activer l'export si des GPS trouvés
            if (foundGPS > 0) {
                ui.toggleSection('exportSection', true);
            }

        } catch (error) {
            console.error('Erreur analyse GPS:', error);
            ui.showMessage(`Erreur lors de l'analyse GPS: ${error.message}`, 'error');
        } finally {
            this.isAnalyzing = false;
            ui.toggleButton('analyzeGpsBtn', true, '🔍 Analyser GPS détaillé');
            ui.updateProgress(0, '', false);
        }
    }

    /**
     * Met à jour le filtre actuel
     * @param {string} filter - Nouveau filtre (all, gps, no-gps)
     */
    setFilter(filter) {
        this.currentFilter = filter;
        this.currentPage = 1; // Reset à la première page
        ui.updateFilterButtons(filter);
        this.updateDisplay();
    }

    /**
     * Change de page
     * @param {number} page - Numéro de page
     */
    setPage(page) {
        const filteredPhotos = this.getFilteredPhotos();
        const maxPage = Math.ceil(filteredPhotos.length / this.photosPerPage);

        this.currentPage = Math.max(1, Math.min(page, maxPage));
        this.updateDisplay();
    }

    /**
     * Page précédente
     */
    previousPage() {
        this.setPage(this.currentPage - 1);
    }

    /**
     * Page suivante
     */
    nextPage() {
        this.setPage(this.currentPage + 1);
    }

    /**
     * Met à jour l'affichage des photos
     */
    updateDisplay() {
        if (this.photos.length === 0) {
            ui.toggleSection('photosSection', false);
            return;
        }

        ui.displayPhotos(this.photos, {
            filter: this.currentFilter,
            currentPage: this.currentPage,
            photosPerPage: this.photosPerPage,
            copyMode: gpsManager.isCopyMode(),
            pasteMode: gpsManager.isPasteMode()
        });
    }

    /**
     * Met à jour les statistiques
     */
    updateStats() {
        const stats = {
            total: this.photos.length,
            analyzed: this.photos.filter(p => p.analyzed).length,
            withGPS: this.photos.filter(p => p.hasGPS).length
        };

        ui.updateStats(stats);

        // Afficher les sections appropriées
        ui.toggleSection('statsSection', this.photos.length > 0);
        ui.toggleSection('photoControls', this.photos.length > 0);
    }

    /**
     * Trouve une photo par son ID
     * @param {string} photoId - ID de la photo
     * @returns {object|null} - Photo trouvée ou null
     */
    findPhotoById(photoId) {
        return this.photos.find(photo => photo.id === photoId) || null;
    }

    /**
     * Met à jour les données GPS d'une photo
     * @param {string} photoId - ID de la photo
     * @param {object} gpsData - Nouvelles données GPS
     */
    updatePhotoGPS(photoId, gpsData) {
        const photo = this.findPhotoById(photoId);
        if (photo) {
            photo.hasGPS = true;
            photo.gpsData = { ...gpsData };
            photo.analyzed = true;

            this.updateStats();
            this.updateDisplay();

            console.log(`GPS mis à jour pour ${photo.filename}:`, gpsData);
        }
    }

    /**
     * Efface toutes les photos
     */
    clearPhotos() {
        this.photos = [];
        this.currentPage = 1;
        this.currentPeriod = null;
        this.analysisProgress = { analyzed: 0, total: 0, foundGPS: 0 };

        this.updateStats();
        this.updateDisplay();

        ui.toggleSection('photosSection', false);
        ui.toggleSection('photoControls', false);
        ui.toggleSection('statsSection', false);
        ui.toggleSection('exportSection', false);
    }

    /**
     * Exporte les photos avec GPS en CSV
     * @returns {string} - Contenu CSV
     */
    exportToCSV() {
        const photosWithGPS = this.getPhotosWithGPS();

        if (photosWithGPS.length === 0) {
            ui.showMessage('Aucune photo avec GPS à exporter', 'warning');
            return null;
        }

        const headers = ['Nom', 'Latitude', 'Longitude', 'Pays', 'Ville', 'Altitude', 'Date'];
        const rows = photosWithGPS.map(photo => {
            const gps = photo.gpsData;
            return [
                `"${photo.filename}"`,
                gps.latitude,
                gps.longitude,
                `"${gps.country || 'Inconnu'}"`,
                `"${gps.city || 'Inconnue'}"`,
                gps.altitude || '',
                `"${photo.fileCreatedAt}"`
            ].join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');

        this.downloadFile(csv, this.generateFilename('csv'), 'text/csv');
        ui.showMessage(`${photosWithGPS.length} photos exportées en CSV`, 'success');

        return csv;
    }

    /**
     * Exporte les photos avec GPS en JSON
     * @returns {object} - Données JSON
     */
    exportToJSON() {
        const photosWithGPS = this.getPhotosWithGPS();

        if (photosWithGPS.length === 0) {
            ui.showMessage('Aucune photo avec GPS à exporter', 'warning');
            return null;
        }

        const data = {
            metadata: {
                exportDate: new Date().toISOString(),
                period: this.currentPeriod,
                totalPhotos: photosWithGPS.length,
                source: 'Immich GPS Manager'
            },
            photos: photosWithGPS.map(photo => ({
                id: photo.id,
                filename: photo.filename,
                fileCreatedAt: photo.fileCreatedAt,
                gps: photo.gpsData
            }))
        };

        const json = JSON.stringify(data, null, 2);

        this.downloadFile(json, this.generateFilename('json'), 'application/json');
        ui.showMessage(`${photosWithGPS.length} photos exportées en JSON`, 'success');

        return data;
    }

    /**
     * Exporte les photos avec GPS en KML (Google Earth)
     * @returns {string} - Contenu KML
     */
    exportToKML() {
        const photosWithGPS = this.getPhotosWithGPS();

        if (photosWithGPS.length === 0) {
            ui.showMessage('Aucune photo avec GPS à exporter', 'warning');
            return null;
        }

        const periodName = this.formatPeriod(this.currentPeriod);

        const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Photos GPS - ${periodName}</name>
    <description>Coordonnées GPS extraites des photos Immich pour ${periodName}</description>
    <Style id="photoIcon">
      <IconStyle>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pal2/icon32.png</href>
        </Icon>
      </IconStyle>
    </Style>
    ${photosWithGPS.map(photo => {
            const gps = photo.gpsData;
            const date = new Date(photo.fileCreatedAt).toLocaleDateString('fr-FR');

            return `
    <Placemark>
      <name>${photo.filename}</name>
      <description><![CDATA[
        <b>Date :</b> ${date}<br>
        <b>Lieu :</b> ${gps.country} - ${gps.city}<br>
        <b>Coordonnées :</b> ${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}
        ${gps.altitude ? `<br><b>Altitude :</b> ${gps.altitude} m` : ''}
      ]]></description>
      <styleUrl>#photoIcon</styleUrl>
      <Point>
        <coordinates>${gps.longitude},${gps.latitude},${gps.altitude || 0}</coordinates>
      </Point>
    </Placemark>`;
        }).join('')}
  </Document>
</kml>`;

        this.downloadFile(kml, this.generateFilename('kml'), 'application/vnd.google-earth.kml+xml');
        ui.showMessage(`${photosWithGPS.length} photos exportées en KML`, 'success');

        return kml;
    }

    /**
     * Génère un nom de fichier pour l'export
     * @param {string} extension - Extension du fichier
     * @returns {string} - Nom du fichier
     */
    generateFilename(extension) {
        const period = this.formatPeriod(this.currentPeriod);
        const date = new Date().toISOString().split('T')[0];

        return `photos_gps_${period}_${date}.${extension}`;
    }

    /**
     * Formate une période pour l'affichage
     * @param {object} period - Période {year, month}
     * @returns {string} - Période formatée
     */
    formatPeriod(period) {
        if (!period) return 'inconnue';
        return period.month ? `${period.year}-${period.month}` : period.year;
    }

    /**
     * Télécharge un fichier
     * @param {string} content - Contenu du fichier
     * @param {string} filename - Nom du fichier
     * @param {string} mimeType - Type MIME
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    }

    /**
     * Retourne les statistiques complètes
     * @returns {object} - Statistiques détaillées
     */
    getDetailedStats() {
        const analyzed = this.photos.filter(p => p.analyzed);
        const withGPS = this.getPhotosWithGPS();
        const withoutGPS = this.getPhotosWithoutGPS();

        return {
            total: this.photos.length,
            analyzed: analyzed.length,
            withGPS: withGPS.length,
            withoutGPS: withoutGPS.length,
            pending: this.photos.length - analyzed.length,
            gpsPercentage: analyzed.length > 0 ? (withGPS.length / analyzed.length * 100).toFixed(1) : 0,
            currentFilter: this.currentFilter,
            currentPage: this.currentPage,
            period: this.currentPeriod
        };
    }

    /**
     * Recherche de photos par nom
     * @param {string} searchTerm - Terme de recherche
     * @returns {Array} - Photos correspondantes
     */
    searchPhotos(searchTerm) {
        if (!searchTerm.trim()) return this.photos;

        const term = searchTerm.toLowerCase();
        return this.photos.filter(photo =>
            photo.filename.toLowerCase().includes(term)
        );
    }

    /**
     * Retourne l'état actuel du gestionnaire
     * @returns {object} - État complet
     */
    getState() {
        return {
            photos: this.photos.length,
            currentFilter: this.currentFilter,
            currentPage: this.currentPage,
            currentPeriod: this.currentPeriod,
            isAnalyzing: this.isAnalyzing,
            stats: this.getDetailedStats()
        };
    }
}

// Export de l'instance
const photosManager = new PhotosManager();

// Fonctions globales pour l'interface
window.copyGPSCoordinates = function (latitude, longitude) {
    const coords = `${latitude}, ${longitude}`;
    navigator.clipboard.writeText(coords).then(() => {
        ui.showMessage('Coordonnées copiées dans le presse-papier', 'success');
    }).catch(err => {
        console.error('Erreur copie:', err);
        ui.showMessage('Erreur lors de la copie', 'error');
    });
};
