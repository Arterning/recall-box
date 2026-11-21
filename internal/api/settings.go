package api

import (
	"errors"
	"math"
	"net/http"
	"recall-box/internal/model"
	"strconv"
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
	writeJSON(w, 200, map[string]float64{"desiredRetention": retention})
}

func (s *Server) updateSettings(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DesiredRetention float64 `json:"desiredRetention"`
	}
	if !decode(w, r, &input) {
		return
	}
	if math.IsNaN(input.DesiredRetention) || math.IsInf(input.DesiredRetention, 0) || input.DesiredRetention < 0.70 || input.DesiredRetention > 0.97 {
		writeError(w, 400, errors.New("desiredRetention must be between 0.70 and 0.97"))
		return
	}
	var setting model.AppSetting
	if err := s.db.First(&setting, "key = ?", "desiredRetention").Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	setting.Value = strconv.FormatFloat(input.DesiredRetention, 'f', 2, 64)
	if err := s.db.Save(&setting).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]float64{"desiredRetention": input.DesiredRetention})
}
