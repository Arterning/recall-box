package api

import (
	"errors"
	"math"
	"net/http"
	"recall-box/internal/model"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

func (s *Server) desiredRetention() (float64, error) {
	var setting model.AppSetting
	if err := s.db.First(&setting, "key = ?", "desiredRetention").Error; err != nil {
		return 0, err
	}
	value, err := strconv.ParseFloat(setting.Value, 64)
	if err != nil {
		return 0, err
	}
	return value, nil
}

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	retention, err := s.desiredRetention()
	if err != nil {
		writeError(w, 500, err)
		return
	}
	values := map[string]string{}
	for _, key := range []string{"aiBaseURL", "aiModel"} {
		var setting model.AppSetting
		if err := s.db.First(&setting, "key = ?", key).Error; err == nil {
			values[key] = setting.Value
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			writeError(w, 500, err)
			return
		}
	}
	var apiKey model.AppSetting
	keyConfigured := s.db.First(&apiKey, "key = ?", "aiAPIKey").Error == nil && apiKey.Value != ""
	writeJSON(w, 200, map[string]any{"desiredRetention": retention, "aiBaseURL": values["aiBaseURL"], "aiModel": values["aiModel"], "aiAPIKeyConfigured": keyConfigured})
}

func (s *Server) updateSettings(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DesiredRetention float64 `json:"desiredRetention"`
		AIBaseURL        *string `json:"aiBaseURL"`
		AIAPIKey         *string `json:"aiAPIKey"`
		AIModel          *string `json:"aiModel"`
		ClearAIAPIKey    bool    `json:"clearAIAPIKey"`
	}
	if !decode(w, r, &input) {
		return
	}
	if math.IsNaN(input.DesiredRetention) || math.IsInf(input.DesiredRetention, 0) || input.DesiredRetention < 0.70 || input.DesiredRetention > 0.97 {
		writeError(w, 400, errors.New("desiredRetention must be between 0.70 and 0.97"))
		return
	}
	updates := map[string]string{"desiredRetention": strconv.FormatFloat(input.DesiredRetention, 'f', 2, 64)}
	if input.AIBaseURL != nil {
		updates["aiBaseURL"] = strings.TrimSpace(*input.AIBaseURL)
	}
	if input.AIModel != nil {
		updates["aiModel"] = strings.TrimSpace(*input.AIModel)
	}
	if input.AIAPIKey != nil && strings.TrimSpace(*input.AIAPIKey) != "" {
		updates["aiAPIKey"] = strings.TrimSpace(*input.AIAPIKey)
	}
	if input.ClearAIAPIKey {
		updates["aiAPIKey"] = ""
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		for key, value := range updates {
			setting := model.AppSetting{Key: key, Value: value}
			if err := tx.Where("key = ?", key).Assign(model.AppSetting{Value: value}).FirstOrCreate(&setting).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		writeError(w, 500, err)
		return
	}
	var savedKey model.AppSetting
	keyConfigured := s.db.First(&savedKey, "key = ?", "aiAPIKey").Error == nil && savedKey.Value != ""
	writeJSON(w, 200, map[string]any{"desiredRetention": input.DesiredRetention, "aiAPIKeyConfigured": keyConfigured})
}
