// src/lib/i18n.ts
// קובץ תרגום מרכזי — VetTrack עברית

export const t = {

  common: {
    appName: "VetTrack",
    save: "שמור",
    cancel: "ביטול",
    delete: "מחק",
    edit: "ערוך",
    close: "סגור",
    back: "חזרה",
    search: "חיפוש",
    loading: "טוען...",
    working: "מעבד...",
    confirm: "אישור",
    all: "הכל",
    none: "ללא",
    unknown: "לא ידוע",
    select: "בחירה",
    unfiled: "ללא תיקייה",
    justNow: "עכשיו",
    sterilization: "חיטוי",
    closeNavigationMenu: "סגור תפריט ניווט",
    openNavigationMenu: "פתח תפריט ניווט",
    quickSettings: "הגדרות מהירות",
  },

  status: {
    ok: "תקין",
    issue: "תקלה",
    maintenance: "תחזוקה",
    sterilized: "עבר חיטוי",
    all: "כל הסטטוסים",
  },

  layout: {
    nav: {
      alerts: "התראות",
      mine: "שלי",
    },
    settings: {
      darkMode: "מצב לילה",
      displaySize: "גודל תצוגה",
      comfortable: "רגיל",
      compact: "קומפקטי",
      masterSound: "שמע ראשי",
      criticalAlerts: "התראות קריטיות",
    },
    toast: {
      equipmentNotFound: "הציוד לא נמצא — נסה שוב",
    },
    sync: {
      pendingActions: (count: number) =>
        `${count} פעולות ממתינות לסנכרון — לחץ לסנכרון`,
      failedActions: (count: number) =>
        `${count} פעולות נכשלו בסנכרון`,
      viewQueue: "צפה בתור הסנכרון",
      failedMessage:
        "חלק מהפעולות נכשלו. לחץ על אייקון הענן לניסיון מחדש.",
      pendingMessage: (count: number) =>
        `${count} פעולות נשמרו מקומית וממתינות לשרת. לחץ לסנכרון עכשיו, או שהן יסונכרנו אוטומטית כשתתחבר.`,
    },
  },

  equipmentList: {
    search: {
      placeholder: "חיפוש לפי שם, מספר סידורי, דגם...",
    },
    folders: {
      all: "כל התיקיות",
      unfiled: "ללא תיקייה",
      searchPlaceholder: "חיפוש תיקיות...",
    },
    actions: {
      select: "בחירה",
      cancel: "ביטול",
      move: "העבר",
      delete: "מחק",
      working: "מעבד...",
      exportExcel: "ייצוא לאקסל",
    },
    empty: {
      message: "לא נמצא ציוד",
      filteredHint: "נסה לשנות את המסננים או את מונח החיפוש.",
      emptyHint: "הוסף את הפריט הראשון כדי להתחיל במעקב.",
    },
    errors: {
      loadFailed: "טעינת הציוד נכשלה. נסה שוב.",
      renderFailed: "תצוגת רשימת הציוד נכשלה",
    },
    toast: {
      deleteSuccess: (count: number) => `נמחקו ${count} פריטים בהצלחה`,
      deleteError: "המחיקה נכשלה",
      moveSuccess: "הועבר בהצלחה",
      moveError: "ההעברה נכשלה",
      checkoutError: "לקיחת הציוד נכשלה",
      returnError: "ההחזרה נכשלה",
    },
  },

  equipmentDetail: {
    serialNumber: "מספר סידורי",
    model: "דגם",
    manufacturer: "יצרן",
    purchaseDate: "תאריך רכישה",
    location: "מיקום",
    maintenanceInterval: "מרווח תחזוקה",
    lastMaintenance: "תחזוקה אחרונה",
    lastSterilization: "חיטוי אחרון",
    issuePhoto: "תמונת תקלה",
    loadOlder: "טען ישנים יותר",
    describeIssue: "תאר את התקלה בבירור...",
    addObservations: "הוסף הערות...",
    toast: {
      undone: "הפעולה בוטלה",
      undoFailed: "הביטול נכשל — הזמן פג",
      savedOffline: "נשמר במצב לא מקוון — יסונכרן כשתתחבר",
      issueReportedOffline:
        "תקלה דווחה — הודעת WhatsApp תישלח כשתתחבר.",
      issueReportedWhatsApp: "תקלה דווחה — נשלחה התראת WhatsApp.",
      scanFailed: (msg: string) => msg || "הסריקה נכשלה",
      checkedOut: "הציוד בשימוש",
      checkedOutByYou: "הוצא לשימוש על ידך",
      dismiss: "סגור",
      photoSizeLimit: "גודל התמונה עד 2MB",
      trying: "מנסה...",
      tryAgain: "נסה שוב",
      duplicateEquipment: "שכפל ציוד",
      checkoutFailed: (msg: string) => msg || "לקיחת הציוד נכשלה",
      returned: "הציוד זמין",
      returnFailed: (msg: string) => msg || "ההחזרה נכשלה",
      deleted: "הציוד נמחק",
      deleteFailed: "המחיקה נכשלה",
      issueReported: "תקלה דווחה",
      issueWhatsAppOffline: "הודעת WhatsApp תישלח כשתתחבר.",
      reportFailed: (msg: string) => msg || "הדיווח נכשל",
    },
  },

  newEquipment: {
    heading: {
      edit: "עריכת ציוד",
      duplicate: "שכפול ציוד",
      add: "הוספת ציוד",
    },
    fields: {
      name: {
        placeholder: "לדוגמה: אוטוקלב יחידה א׳",
        error: "שם הוא שדה חובה",
      },
      serialNumber: { placeholder: "SN-12345" },
      model: { placeholder: "שם דגם" },
      manufacturer: { placeholder: "יצרן" },
      folder: { placeholder: "ללא תיקייה", none: "ללא תיקייה" },
      location: { placeholder: "לדוגמה: חדר ניתוח 1" },
    },
    saveChanges: "שמור שינויים",
    saveEquipment: "שמור ציוד",
    toast: {
      addSuccess: "הציוד נוסף בהצלחה!",
      addError: (msg: string) => msg || "שמירת הציוד נכשלה. נסה שוב.",
      updateSuccess: "הציוד עודכן בהצלחה!",
      updateError: (msg: string) =>
        msg || "עדכון הציוד נכשל. נסה שוב.",
      timeout: "תוקף הבקשה פג. אנא בדוק את החיבור ונסה שוב.",
    },
  },

  myEquipment: {
    toast: {
      returnSuccess: "הציוד זמין",
      returnError: "ההחזרה נכשלה",
      returnAllSuccess: (count: number) =>
        `הוחזרו ${count} פריטים — כל הציוד זמין`,
      returnAllPartialError: "חלק מהפריטים לא הוחזרו. נסה שוב.",
    },
    empty: {
      message: "אין ציוד בשימוש",
      subMessage: "ציוד שתיקח יופיע כאן.",
    },
    errors: {
      loadFailed: "טעינת ציוד בשימוש נכשלה. נסה שוב.",
    },
    actions: {
      returnAll: "החזר הכל",
    },
  },

  alerts: {
    types: {
      issue: { label: "תקלה פעילה", badgeLabel: "קריטי" },
      overdue: { label: "באיחור", badgeLabel: "גבוה" },
      sterilization_due: { label: "נדרש חיטוי", badgeLabel: "בינוני" },
      inactive: { label: "לא פעיל", badgeLabel: "נמוך" },
    },
    itemCount: (count: number) =>
      `${count} פריט${count !== 1 ? "ים" : ""}`,
    timeAgo: {
      justNow: "עכשיו",
    },
    toast: {
      acknowledged: "סומן בטיפול",
      acknowledgeError: "האישור נכשל",
      removeError: "ההסרה נכשלה",
    },
    empty: {
      message: "הכל תקין!",
      subMessage: "אין התראות כרגע. כל הציוד במצב תקין.",
    },
    errors: {
      loadFailed: "טעינת ההתראות נכשלה. נסה שוב.",
    },
  },

  shiftSummary: {
    sections: {
      checkedOut: "בשימוש כרגע:",
      checkoutsToday: "שימושים היום:",
      issuesReported: "תקלות שדווחו היום:",
      unacknowledgedAlerts: "התראות שלא טופלו:",
    },
    severity: {
      critical: "[קריטי]",
      high: "[גבוה]",
    },
    badge: {
      critical: "קריטי",
      high: "גבוה",
    },
    toast: {
      copySuccess: "הסיכום הועתק ללוח",
      copyError: "ההעתקה נכשלה — אנא העתק ידנית",
    },
    actions: {
      copy: "העתק",
      exportExcel: "ייצוא לאקסל",
    },
  },

  auth: {
    signIn: {
      meta: {
        description:
          "התחבר ל-VetTrack לניהול ציוד וטרינרי, סריקת QR ומעקב בזמן אמת.",
      },
    },
    signUp: {
      meta: {
        description:
          "צור חשבון VetTrack לניהול ציוד וטרינרי, סריקת QR ומעקב בזמן אמת.",
      },
    },
  },

  home: {
    equipmentOverview: "סקירת ציוד",
    shiftSummary: "סיכום משמרת",
    scanQrCode: "סרוק QR",
    addEquipment: "הוסף ציוד",
    browseEquipment: "עיין בציוד",
  },

  equipment: {
    title: "ציוד",
    scanQr: "סרוק QR",
    shiftSummary: "סיכום משמרת",
    myEquipment: "הציוד שלי",
    importCsv: "ייבוא CSV",
    select: "בחירה",
  },

} as const;
