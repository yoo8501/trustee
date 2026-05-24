package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type successResponse struct {
	Data interface{} `json:"data"`
}

type listResponse struct {
	Data  interface{} `json:"data"`
	Total int64       `json:"total"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type errorResponse struct {
	Error errorBody `json:"error"`
}

func respondSuccess(c *gin.Context, status int, data interface{}) {
	c.JSON(status, successResponse{Data: data})
}

func respondList(c *gin.Context, data interface{}, total int64) {
	c.JSON(http.StatusOK, listResponse{Data: data, Total: total})
}

func respondError(c *gin.Context, status int, code, message string) {
	c.JSON(status, errorResponse{
		Error: errorBody{Code: code, Message: message},
	})
}
