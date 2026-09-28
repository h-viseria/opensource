const REAM_PICK = {
  description: 'Office or PDF',
  accept: '.pdf,.docx,.pptx,.xlsx,.doc,.xls,.ppt',
  types: [{
    description: 'Office or PDF',
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/msword': ['.doc'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.ms-excel': ['.xls'],
    },
  }],
};

export async function pickReamConvertFile() {
  if ('showOpenFilePicker' in window) {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      excludeAcceptAllOption: false,
      types: REAM_PICK.types,
    });
    return handle.getFile();
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept: REAM_PICK.accept,
    });
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}
