package requestaudit

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

const (
	defaultListPageSize = 20
	maxListPageSize     = 100
)

// auditListItem 是列表接口返回的摘要，不含完整 body/headers，避免大字段批量传输。
type auditListItem struct {
	Id        int    `json:"id"`
	RequestId string `json:"request_id"`
	UserId    int    `json:"user_id"`
	Username  string `json:"username"`
	TokenName string `json:"token_name"`
	ModelName string `json:"model_name"`
	BodySize  int    `json:"body_size"`
	Truncated bool   `json:"truncated"`
	CreatedAt int64  `json:"created_at"`
}

// GetRecordByRequestId 返回单条审计记录（含 body + headers）。挂在 AdminAuth 下。
func GetRecordByRequestId(c *gin.Context) {
	requestID := c.Param("request_id")
	if requestID == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "request_id is required"})
		return
	}
	if logDB == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "request audit not initialized"})
		return
	}

	var record RelayAuditRecord
	if err := logDB.Where("request_id = ?", requestID).First(&record).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "record not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": recordToDetail(record)})
}

// GetSelfRecordByRequestId 返回当前登录用户自己的单条审计记录。挂在 UserAuth 下，
// 强制按 user_id 过滤，防止用户通过 request_id 读取他人请求内容。
func GetSelfRecordByRequestId(c *gin.Context) {
	requestID := c.Param("request_id")
	if requestID == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "request_id is required"})
		return
	}
	if logDB == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "request audit not initialized"})
		return
	}

	userID := c.GetInt("id")
	if userID <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "record not found"})
		return
	}

	var record RelayAuditRecord
	if err := logDB.Where("request_id = ? AND user_id = ?", requestID, userID).First(&record).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "record not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": recordToDetail(record)})
}

// ListRecords 按 user_id / model / 时间范围分页返回摘要。挂在 AdminAuth 下。
func ListRecords(c *gin.Context) {
	if logDB == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "request audit not initialized"})
		return
	}

	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	if pageSize <= 0 {
		pageSize = defaultListPageSize
	}
	if pageSize > maxListPageSize {
		pageSize = maxListPageSize
	}

	tx := logDB.Model(&RelayAuditRecord{})
	if userID, err := strconv.Atoi(c.Query("user_id")); err == nil && userID > 0 {
		tx = tx.Where("user_id = ?", userID)
	}
	if modelName := c.Query("model"); modelName != "" {
		tx = tx.Where("model_name = ?", modelName)
	}
	// 时间范围默认近 7 天。
	start, _ := strconv.ParseInt(c.Query("start"), 10, 64)
	end, _ := strconv.ParseInt(c.Query("end"), 10, 64)
	if end <= 0 {
		end = time.Now().Unix()
	}
	if start <= 0 {
		start = end - 7*24*3600
	}
	tx = tx.Where("created_at >= ? AND created_at <= ?", start, end)

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	var records []RelayAuditRecord
	if err := tx.Order("created_at desc").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&records).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	items := make([]auditListItem, 0, len(records))
	for _, r := range records {
		items = append(items, auditListItem{
			Id:        r.Id,
			RequestId: r.RequestId,
			UserId:    r.UserId,
			Username:  usernameFor(r.UserId),
			TokenName: r.TokenName,
			ModelName: r.ModelName,
			BodySize:  r.BodySize,
			Truncated: r.Truncated,
			CreatedAt: r.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items":     items,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// usernameFor 解析 user_id → username。在列表/详情中调用，不在 relay 热路径上。
// 注意：这会查 DB。如果列表量大可改为批量预取，目前每页上限 100 条可接受。
func usernameFor(userID int) string {
	if userID <= 0 {
		return ""
	}
	name, _ := model.GetUsernameById(userID, false)
	return name
}

// recordToDetail 将单条记录转为详情响应，附带 username 解析。
func recordToDetail(r RelayAuditRecord) gin.H {
	return gin.H{
		"id":           r.Id,
		"request_id":   r.RequestId,
		"user_id":      r.UserId,
		"username":     usernameFor(r.UserId),
		"token_id":     r.TokenId,
		"token_name":   r.TokenName,
		"model_name":   r.ModelName,
		"method":       r.Method,
		"path":         r.Path,
		"client_ip":    r.ClientIp,
		"content_type": r.ContentType,
		"headers":      r.Headers,
		"body":         r.Body,
		"body_size":    r.BodySize,
		"truncated":    r.Truncated,
		"created_at":   r.CreatedAt,
	}
}
