/**
 * GPS.JS - Gestion du copie/colle GPS
 * 
 * Ce fichier gère :
 * - Les modes copie et collage GPS
 * - Le presse-papier GPS
 * - Les confirmations de collage
 * - La mise à jour des coordonnées
 * - Les interactions avec les cartes photo
 */

class GPSManager {
    constructor() {
        this.copyMode = false;
        this.pasteMode = false;
        this.clipboard = null; // {gpsData, sourcePhoto, timestamp}
        this.pendingPaste = null; // Photo en attente de collage
    }

    /**
     * Active/désactive le mode copie GPS
     */
    toggleCopyMode() {
        this.copyMode = !this.copyMode;
        this.pasteMode = false; // Désactiver l'autre mode
        
        // Mettre à jour l'interface
        this.updateModeButtons();
        this.updatePhotoDisplay();
        
        const message = this.copyMode 
            ? 'Mode copie GPS activé - Cliquez sur une photo avec GPS'
            : 'Mode copie désactivé';
        
        ui.showMessage(message, 'info');
        
        console.log('Mode copie GPS:', this.copyMode);
    }

    /**
     * Active/désactive le mode collage GPS
     */
    togglePasteMode() {
        if (!this.clipboard) {
            ui.showMessage('Aucune coordonnée GPS copiée. Utilisez d\'abord le mode copie.', 'warning');
            return;
        }

        this.pasteMode = !this.pasteMode;
        this.copyMode = false; // Désactiver l'autre mode
        
        // Mettre à jour l'interface
        this.updateModeButtons();
        this.updatePhotoDisplay();
        
        const message = this.pasteMode 
            ? 'Mode collage GPS activé - Cliquez sur une photo sans GPS'
            : 'Mode collage désactivé';
        
        ui.showMessage(message, 'info');
        
        console.log('Mode collage GPS:', this.pasteMode);
    }

    /**
     * Gère le clic sur une photo
     * @param {string} photoId - ID de la photo cliquée
     */
    async handlePhotoClick(photoId) {
        const photo = photosManager.findPhotoById(photoId);
        
        if (!photo) {
            console.error('Photo non trouvée:', photoId);
            return;
        }

        if (this.copyMode) {
            await this.handleCopyClick(photo);
        } else if (this.pasteMode) {
            await this.handlePasteClick(photo);
        } else {
            // Mode normal - ouvrir Google Maps si GPS disponible
            this.handleNormalClick(photo);
        }
    }

    /**
     * Gère le clic en mode copie
     * @param {object} photo - Photo cliquée
     */
    async handleCopyClick(photo) {
        if (!photo.hasGPS || !photo.gpsData) {
            // Essayer d'analyser cette photo spécifiquement
            ui.showMessage('Analyse GPS en cours...', 'info');
            
            try {
                const details = await immichAPI.getPhotoDetails(photo.id);
                
                if (details && details.exifInfo && details.exifInfo.latitude && details.exifInfo.longitude) {
                    // Mettre à jour la photo avec les données GPS trouvées
                    const gpsData = {
                        latitude: parseFloat(details.exifInfo.latitude),
                        longitude: parseFloat(details.exifInfo.longitude),
                        country: details.exifInfo.country || 'Inconnu',
                        city: details.exifInfo.city || 'Inconnue',
                        altitude: details.exifInfo.altitude || null
                    };
                    
                    photosManager.updatePhotoGPS(photo.id, gpsData);
                    
                    // Copier les nouvelles données
                    this.copyGPS(photo, gpsData);
                    ui.showMessage('GPS trouvé et copié !', 'success');
                } else {
                    ui.showMessage('Cette photo n\'a pas de coordonnées GPS', 'error');
                }
            } catch (error) {
                console.error('Erreur analyse GPS:', error);
                ui.showMessage('Erreur lors de l\'analyse GPS', 'error');
            }
            return;
        }

        // Copier les GPS existants
        this.copyGPS(photo, photo.gpsData);
        ui.showMessage(`GPS copié depuis "${photo.filename}"`, 'success');
    }

    /**
     * Gère le clic en mode collage
     * @param {object} photo - Photo cliquée
     */
    async handlePasteClick(photo) {
        if (photo.hasGPS) {
            ui.showMessage('Cette photo a déjà des coordonnées GPS', 'warning');
            return;
        }

        if (!this.clipboard) {
            ui.showMessage('Aucune coordonnée GPS en mémoire', 'error');
            return;
        }

        // Demander confirmation
        const confirmed = await ui.showConfirmModal(
            'Confirmer le collage GPS',
            `Voulez-vous coller les coordonnées GPS sur "${photo.filename}" ?`,
            this.clipboard.gpsData
        );

        if (confirmed) {
            await this.pasteGPS(photo);
        }
    }

    /**
     * Gère le clic en mode normal
     * @param {object} photo - Photo cliquée
     */
    handleNormalClick(photo) {
        if (photo.hasGPS && photo.gpsData) {
            // Ouvrir Google Maps
            const { latitude, longitude } = photo.gpsData;
            const url = `https://www.google.com/maps?q=${latitude},${longitude}&z=15`;
            window.open(url, '_blank');
            ui.showMessage('Ouverture de Google Maps...', 'info');
        } else {
            ui.showMessage('Cette photo n\'a pas de coordonnées GPS', 'info');
        }
    }

    /**
     * Copie les coordonnées GPS
     * @param {object} photo - Photo source
     * @param {object} gpsData - Données GPS à copier
     */
    copyGPS(photo, gpsData) {
        this.clipboard = {
            gpsData: { ...gpsData },
            sourcePhoto: photo.filename,
            sourceId: photo.id,
            timestamp: Date.now()
        };

        // Mettre à jour l'affichage du presse-papier
        ui.updateClipboard(gpsData, photo.filename);
        
        // Activer le bouton de collage
        ui.toggleButton('pasteModeBtn', true);
        
        // Passer automatiquement en mode collage
        this.copyMode = false;
        this.pasteMode = true;
        this.updateModeButtons();
        this.updatePhotoDisplay();

        console.log('GPS copié:', gpsData);
    }

    /**
     * Colle les coordonnées GPS sur une photo
     * @param {object} photo - Photo de destination
     */
    async pasteGPS(photo) {
        if (!this.clipboard) {
            ui.showMessage('Aucune coordonnée GPS à coller', 'error');
            return;
        }

        try {
            ui.showMessage('Mise à jour des coordonnées GPS...', 'info');

            // Simuler la mise à jour GPS (en réalité, Immich ne permet pas de modifier les EXIF)
            // Dans un vrai cas d'usage, il faudrait :
            // 1. Soit utiliser une API personnalisée pour mettre à jour les métadonnées
            // 2. Soit maintenir une base de données locale des corrections GPS
            // 3. Soit exporter les corrections pour traitement externe

            // Pour cette démo, on met à jour localement
            photosManager.updatePhotoGPS(photo.id, this.clipboard.gpsData);

            // Log de l'action pour debug/export
            this.logGPSPaste(photo, this.clipboard);

            ui.showMessage(
                `✅ GPS collé sur "${photo.filename}" depuis "${this.clipboard.sourcePhoto}"`, 
                'success'
            );

            // Optionnel : rester en mode collage pour coller sur d'autres photos
            // this.clearClipboard();

        } catch (error) {
            console.error('Erreur collage GPS:', error);
            ui.showMessage(`Erreur lors du collage GPS: ${error.message}`, 'error');
        }
    }

    /**
     * Efface le presse-papier GPS
     */
    clearClipboard() {
        this.clipboard = null;
        this.pasteMode = false;
        
        // Mettre à jour l'interface
        ui.updateClipboard(null, null);
        ui.toggleButton('pasteModeBtn', false);
        this.updateModeButtons();
        this.updatePhotoDisplay();
        
        ui.showMessage('Presse-papier GPS vidé', 'info');
        
        console.log('Presse-papier GPS effacé');
    }

    /**
     * Met à jour les boutons de mode
     */
    updateModeButtons() {
        const copyBtn = document.getElementById('copyModeBtn');
        const pasteBtn = document.getElementById('pasteModeBtn');

        if (copyBtn) {
            copyBtn.classList.toggle('active', this.copyMode);
        }

        if (pasteBtn) {
            pasteBtn.classList.toggle('active', this.pasteMode);
            pasteBtn.disabled = !this.clipboard;
        }
    }

    /**
     * Met à jour l'affichage des photos selon le mode
     */
    updatePhotoDisplay() {
        photosManager.updateDisplay();
    }

    /**
     * Log d'une action de collage GPS (pour debug/export)
     * @param {object} targetPhoto - Photo de destination
     * @param {object} clipboardData - Données du presse-papier
     */
    logGPSPaste(targetPhoto, clipboardData) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            action: 'GPS_PASTE',
            target: {
                id: targetPhoto.id,
                filename: targetPhoto.filename
            },
            source: {
                id: clipboardData.sourceId,
                filename: clipboardData.sourcePhoto
            },
            gpsData: clipboardData.gpsData
        };

        console.log('Action GPS logged:', logEntry);
        
        // Stocker dans localStorage pour persistance (optionnel)
        try {
            const existingLogs = JSON.parse(localStorage.getItem('gps_actions') || '[]');
            existingLogs.push(logEntry);
            
            // Garder seulement les 100 dernières actions
            if (existingLogs.length > 100) {
                existingLogs.splice(0, existingLogs.length - 100);
            }
            
            localStorage.setItem('gps_actions', JSON.stringify(existingLogs));
        } catch (error) {
            console.warn('Impossible de sauvegarder le log GPS:', error);
        }
    }

    /**
     * Exporte les logs d'actions GPS
     * @returns {Array} - Liste des actions GPS
     */
    exportGPSLogs() {
        try {
            const logs = JSON.parse(localStorage.getItem('gps_actions') || '[]');
            
            if (logs.length === 0) {
                ui.showMessage('Aucune action GPS à exporter', 'info');
                return [];
            }

            const csv = [
                'Date,Action,Photo_Destination,Photo_Source,Latitude,Longitude,Pays,Ville',
                ...logs.map(log => [
                    log.timestamp,
                    log.action,
                    `"${log.target.filename}"`,
                    `"${log.source.filename}"`,
                    log.gpsData.latitude,
                    log.gpsData.longitude,
                    `"${log.gpsData.country}"`,
                    `"${log.gpsData.city}"`
                ].join(','))
            ].join('\n');

            // Télécharger
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gps_actions_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            ui.showMessage(`${logs.length} actions GPS exportées`, 'success');
            return logs;

        } catch (error) {
            console.error('Erreur export logs GPS:', error);
            ui.showMessage('Erreur lors de l\'export des logs GPS', 'error');
            return [];
        }
    }

    /**
     * Retourne l'état actuel du gestionnaire GPS
     * @returns {object} - État complet
     */
    getState() {
        return {
            copyMode: this.copyMode,
            pasteMode: this.pasteMode,
            hasClipboard: !!this.clipboard,
            clipboard: this.clipboard ? {
                sourcePhoto: this.clipboard.sourcePhoto,
                coordinates: `${this.clipboard.gpsData.latitude}, ${this.clipboard.gpsData.longitude}`,
                timestamp: this.clipboard.timestamp
            } : null
        };
    }

    /**
     * Vérifie si le mode copie est actif
     * @returns {boolean}
     */
    isCopyMode() {
        return this.copyMode;
    }

    /**
     * Vérifie si le mode collage est actif
     * @returns {boolean}
     */
    isPasteMode() {
        return this.pasteMode;
    }

    /**
     * Vérifie si des données GPS sont en mémoire
     * @returns {boolean}
     */
    hasClipboard() {
        return !!this.clipboard;
    }

    /**
     * Retourne les données du presse-papier
     * @returns {object|null}
     */
    getClipboard() {
        return this.clipboard;
    }

    /**
     * Désactive tous les modes
     */
    resetModes() {
        this.copyMode = false;
        this.pasteMode = false;
        this.updateModeButtons();
        this.updatePhotoDisplay();
    }

    /**
     * Copie des coordonnées GPS vers le presse-papier système
     * @param {number} latitude - Latitude
     * @param {number} longitude - Longitude
     */
    async copyCoordinatesToSystemClipboard(latitude, longitude) {
        const coords = `${latitude}, ${longitude}`;
        
        try {
            await navigator.clipboard.writeText(coords);
            ui.showMessage('Coordonnées copiées dans le presse-papier système', 'success');
        } catch (error) {
            console.error('Erreur copie système:', error);
            ui.showMessage('Erreur lors de la copie', 'error');
        }
    }
}

// Export de l'instance
const gpsManager = new GPSManager();

// Fonction globale pour les clics sur les photos
window.handlePhotoCardClick = function(event) {
    // Empêcher la propagation si c'est un clic sur les coordonnées GPS
    if (event.target.classList.contains('gps-info')) {
        return; // La fonction copyGPSCoordinates s'en occupe
    }

    const photoCard = event.currentTarget;
    const photoId = photoCard.dataset.photoId;
    
    if (photoId) {
        gpsManager.handlePhotoClick(photoId);
    }
};

// Fonction globale pour effacer le presse-papier
window.clearClipboard = function() {
    gpsManager.clearClipboard();
};
