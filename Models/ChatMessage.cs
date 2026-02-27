using System.Collections.Generic;
using System;

namespace TSFamilyFun.Models
{
    public class ChatMessage
    {
        public string User { get; set; } = "";
        public string Message { get; set; } = "";
        public DateTime Timestamp { get; set; } = DateTime.Now;
    }
}
