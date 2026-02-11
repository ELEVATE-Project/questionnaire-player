import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NetworkDetectorService } from './network-detector.service';

@Injectable({
  providedIn: 'root'
})
export class ToastService {

  constructor(private snackBar: MatSnackBar, private networkService: NetworkDetectorService) { }

  private getMessageWithIcon(message: string, type?: string): string {
    if (type === 'success') {
      return `<i class="material-icons" style="vertical-align: middle; color: #4caf50; margin-right: 8px;">check_circle_outline</i>${message}`;
    } else if (type === 'danger') {
      return `<i class="material-icons" style="vertical-align: middle; color: #f44336; margin-right: 8px;">cancel</i>${message}`;
    }
    return message;
  }

  private injectIconIntoSnackbar(messageWithIcon: string) {
    setTimeout(() => {
      const snackbarLabel = document.querySelector('.mdc-snackbar__label');
      if (snackbarLabel) {
        snackbarLabel.innerHTML = messageWithIcon;
      }
    }, 0);
  }

  showToast(message:string,type?:string,duration?:number,verticalPosition?:any,horizontalPosition?:any){
    let styleClass = type ? type : "default"
    let messageWithIcon = this.getMessageWithIcon(message, type);
    let snackBarConfig = {
      duration: duration ? duration : 3000,
      verticalPosition: verticalPosition ? verticalPosition : 'bottom',
      horizontalPosition: horizontalPosition ? horizontalPosition : "center",
      panelClass: [styleClass, 'custom-toast']
    }
    this.snackBar.open(messageWithIcon,'',snackBarConfig);
    if (type === 'success' || type === 'danger') {
      this.injectIconIntoSnackbar(messageWithIcon);
    }
  }

  async showNetworkToast(message: string,type?:string,duration?:number,verticalPosition?:any,horizontalPosition?:any) {
    if (!this.networkService.isConnected()) {
      console.warn('No internet connection. Toast will not be shown.');
      return;
    }

    let styleClass = type ? type : "default"
    let messageWithIcon = this.getMessageWithIcon(message, type);
    let snackBarConfig = {
      duration: duration ? duration : 3000,
      verticalPosition: verticalPosition ? verticalPosition : 'bottom',
      horizontalPosition: horizontalPosition ? horizontalPosition : "center",
      panelClass: [styleClass, 'custom-toast']
    }
    this.snackBar.open(messageWithIcon,'',snackBarConfig);
    if (type === 'success' || type === 'danger') {
      this.injectIconIntoSnackbar(messageWithIcon);
    }
  }

  clearToaster(){
    if (this.snackBar) {
      this.snackBar.dismiss();

    }
  }
}